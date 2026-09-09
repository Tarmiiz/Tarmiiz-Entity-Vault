import { inject, Injectable } from '@angular/core';
import { ethers } from 'ethers';
// @ts-ignore
import * as snarkjs from 'snarkjs';

import GlobalVariablesAbi from '../../../assets/ABIs/GlobalVariablesProxy.json';
import EntityTemplateAbi from '../../../assets/ABIs/EntityTemplate.json';

import { Key } from '../models/data.model';

import { StorageService } from './storage.service';

import { ParseProofUtils, BN254_R } from '../utils/parse-proof.utils';


@Injectable({
  providedIn: 'root'
})
export class EthersService {

  private storageService = inject(StorageService);

  key: Key = new Key('', '', '');

  globalSalt = '';

  rpcProvider: any;
  signer: any;

  variablesProxyContractAddress = '';
  variablesProxyContract: any;

  entityContractAddress = '';
  entityContract: any;

  constructor() {}

  configure(rpcNode: string, entityContract: string, variablesProxyContract: string, globalSalt: string) {
    this.rpcProvider = new ethers.JsonRpcProvider(rpcNode);
    this.entityContractAddress = entityContract;
    this.variablesProxyContractAddress = variablesProxyContract;
    this.globalSalt = globalSalt;
  }

  async init() {
    await this.createWallet();
    await this.connectVariablesProxyContract();
    await this.connectEntityContract();
  }

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// General
// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async createWallet() {
    try {
      const wallet = ethers.Wallet.createRandom();
      this.key.address = wallet.address;
      this.key.privateKey = wallet.privateKey;
      this.key.publicKey = wallet.publicKey;
      this.signer = new ethers.Wallet(this.key.privateKey, this.rpcProvider);
    }
    catch (error: any) {

    }
  }

  async setWallet() {
    try {
      const rpcNode = await this.storageService.get('rpcNode');
      if (rpcNode) { this.rpcProvider = new ethers.JsonRpcProvider(rpcNode); }
      const variablesProxy = await this.storageService.get('variablesProxyContract');
      if (variablesProxy) { this.variablesProxyContractAddress = variablesProxy; }
      const contract = await this.storageService.get('contract');
      if (contract) { this.entityContractAddress = contract; }
      const wallet = await this.storageService.get('wallet');
      this.key = JSON.parse(wallet!);
      this.signer = new ethers.Wallet(this.key.privateKey, this.rpcProvider);
    }
    catch (error: any) {
    }
  }

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Global Variables
// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async connectVariablesProxyContract() {
    try {
      this.variablesProxyContract = new ethers.Contract(this.variablesProxyContractAddress, GlobalVariablesAbi, this.signer);
    }
    catch (error: any) {

    }
  }

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Entity Contract
// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async connectEntityContract() {
    try {
      this.entityContract = new ethers.Contract(this.entityContractAddress, EntityTemplateAbi, this.signer);
    }
    catch (error: any) {
    }
  }

  // Compute the bytes32 commitment that EntityTemplate stores in `proofs[userId].commitment`.
  //
  // Phase 18 (2026-09-09): `Poseidon3(emailBI, stretch(Argon2id(password, salt)), salt)` over a
  // PER-USER `salt` that the contract STORES beside the commitment (18.B4) — so every caller that
  // creates or rotates a credential mints one (`newSalt()`) and sends the pair. The salt is
  // REQUIRED here on purpose: a fallback to `globalSalt` is exactly the shape 18.B4 retired, and a
  // commitment derived over a salt the chain does not hold is a lockout that reports success.
  // ASYNC — Argon2id at 64 MiB takes a few hundred ms in the browser.
  async computeCommitment(username: string, password: string, salt: string): Promise<string | null> {
    try {
      if (!salt || /^0x0+$/.test(salt)) throw new Error('a per-user salt is required (Phase 18)');
      await ParseProofUtils.init();
      const usernameBigInt = ParseProofUtils.stringToBigInt(username);
      const saltBigInt     = BigInt(salt);
      const passwordBigInt = await ParseProofUtils.derivePassword(password, saltBigInt);
      return ParseProofUtils.generateCommitment(usernameBigInt, passwordBigInt, saltBigInt);
    } catch (error: any) {
      console.error('computeCommitment error:', error);
      return null;
    }
  }

  // A fresh per-user login salt (bytes32 hex, reduced mod r). Minted by whoever creates or
  // rotates a credential and sent to the API together with the commitment it was derived over.
  newSalt(): string {
    return ethers.zeroPadValue(ethers.toBeHex(ParseProofUtils.randomSalt()), 32);
  }

  // Phase 18 (18.5) — the HASHES-ONLY tuple every create / admin-reset sends to the API:
  // { loginHash, commitment, salt }, with a fresh per-user salt. The API asserts loginHash matches
  // the username and rejects a plaintext `password` field. Use `commitment` + `salt` alone for a
  // password-only reset (the loginHash is the target's CURRENT username, which must not move).
  async deriveCredential(username: string, password: string): Promise<{ loginHash: string; commitment: string; salt: string } | null> {
    const salt = this.newSalt();
    const commitment = await this.computeCommitment(username, password, salt);
    if (!commitment) return null;
    return { loginHash: await this.computeLoginHash(username), commitment, salt };
  }

  // Phase 18 (18.2) — a Groth16 login proof over the caller's CURRENT credentials, in the shape
  // `resetUserPasswordWithProof` takes ({ a, b, c, input }). Fetches { nonce, commitment, salt }
  // through the Entity API like a login does; the proof is consumed by the API within the same
  // nonce, so it is single-use by construction.
  async proveCurrentPassword(username: string, currentPassword: string, credentials: { nonce: string | number; commitment: string; salt?: string }): Promise<{ a: string[]; b: string[][]; c: string[]; input: string[] } | null> {
    const payload = await this.createLoginPayload(username, currentPassword, 3600, undefined, false, credentials);
    if (!payload) return null;
    return { a: payload.a, b: payload.b, c: payload.c, input: payload.proofInput };
  }

  // Pure (no chain): the bytes32 loginHash EntityTemplate keys a user's credentials by. ApiService
  // uses this to fetch { nonce, commitment } from the Entity API before building the login payload,
  // so login never reads the RPC node directly.
  async computeLoginHash(username: string): Promise<string> {
    await ParseProofUtils.init();
    const usernameBigInt = ParseProofUtils.stringToBigInt(username);
    return ParseProofUtils.hashStringForContract(usernameBigInt);
  }

  // 18.B4: the salt the proof is built over is the one STORED with the credential and returned by
  // /staff/credentials-data (`credentials.salt`) — never `environment.globalSalt`. `saltOverride`
  // survives for the claim wizard, which has the regulator's bootstrap salt in hand from
  // /config; the stored salt of an unclaimed admin IS that value, so the two agree.
  // `passwordIsRawBigInt` — when true, treat `password` as a decimal numeric string (e.g. a 6-digit
  // OTP) and use `BigInt(password)` directly, skipping Argon2id: the Regulator API computes the
  // bootstrap placeholder from the RAW OTP (a server-known placeholder, still stretched in-circuit),
  // so the claim wizard must match. Every real password goes through Argon2id (`derivePassword`).
  // `credentials` — { nonce, commitment, salt } fetched by ApiService through the Entity API so
  // login never hits the RPC node (the Vault has no route to it). Required.
  async createLoginPayload(username: string, password: string, sessionDuration: number, saltOverride: string | undefined, passwordIsRawBigInt: boolean, credentials: { nonce: string | number; commitment: string; salt?: string }) {
    try {
      if (!username || !password || !credentials) return null;
      if (!Number.isInteger(sessionDuration) || sessionDuration <= 0) return null;

      // Initialize ParseProofUtils
      await ParseProofUtils.init();

      // Convert credentials to BigInts
      const usernameBigInt = ParseProofUtils.stringToBigInt(username);
      const globalSaltBigInt = BigInt(credentials.salt ?? saltOverride ?? this.globalSalt);
      const passwordBigInt = passwordIsRawBigInt ? (BigInt(password) % BN254_R) : await ParseProofUtils.derivePassword(password, globalSaltBigInt);

      // Generate contract lookup hash
      const usernameHashHex = ParseProofUtils.hashStringForContract(usernameBigInt);

      // Nonce + stored commitment, fetched by ApiService via the Entity API (login never reads
      // the RPC node directly).
      const { nonce, commitment: storedCommitmentHex } = credentials;

      // Convert stored commitment to circuit format
      const storedCommitmentBigInt = BigInt(storedCommitmentHex);
      const storedCommitmentString = storedCommitmentBigInt.toString();

      const usernameHashBigInt = BigInt(usernameHashHex);
      const usernameHashString = usernameHashBigInt.toString();

      // Prepare circuit input
      const circuitInput = {
        email: usernameBigInt.toString(),
        password: passwordBigInt.toString(),
        salt: globalSaltBigInt.toString(),
        emailHash: usernameHashString,
        storedCommitment: storedCommitmentString,
        nonce: nonce.toString()
      };

      // Generate proof
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInput,
        "assets/zk/Login.wasm",
        "assets/zk/Login_entities.zkey"
      );

      // Parse proof for contract
      const { a, b, c, input: proofInput } = await ParseProofUtils.parseProof({ proof, publicSignals });

      // Sign message with the wallet created in init()
      const message = ethers.solidityPacked(["string", "address"], ["Set owner to:", this.key.address]);
      const messageHash = ethers.keccak256(message);
      const signedMessage = await this.signer.signMessage(ethers.getBytes(messageHash));

      return {
        key: this.key,
        usernameHashHex,
        a: a.map((x: bigint) => x.toString()),
        b: b.map((row: bigint[]) => row.map((x: bigint) => x.toString())),
        c: c.map((x: bigint) => x.toString()),
        proofInput: proofInput.map((x: bigint) => x.toString()),
        signedMessage,
        sessionDuration,
      };
    }
    catch (error: any) {
      console.error('Login payload error:', error);
      return null;
    }
  }

  // Generate a login payload targeting an IdentityTemplate (the entity DID). Differs from
  // createLoginPayload: there's no per-template user table, so credentials live directly on
  // `_credentials.loginHash` / `commitment` / `nonce`. The login() signature on IdentityTemplate
  // omits the usernameHash arg.
  // `credentials` — { nonce, commitment } fetched by the caller through the Entity API so this
  // never reads the RPC node directly (the Vault has no route to the RPC node).
  // An IdentityTemplate stores NO salt until Phase 22.0, so the salt is `saltOverride` (the
  // regulator's bootstrap salt for the DID claim — the placeholder was set to the entity admin's
  // adminSecret at registration) or the entity API's globalSalt for a claimed DID.
  async createIdentityLoginPayload(identityAddress: string, username: string, password: string, sessionDuration: number, saltOverride: string | undefined, passwordIsRawBigInt: boolean, credentials: { nonce: string | number; commitment: string; salt?: string }) {
    try {
      if (!identityAddress || !username || !password || !credentials) return null;
      if (!Number.isInteger(sessionDuration) || sessionDuration <= 0) return null;

      await ParseProofUtils.init();

      const usernameBigInt   = ParseProofUtils.stringToBigInt(username);
      const globalSaltBigInt = BigInt(credentials.salt ?? saltOverride ?? this.globalSalt);
      const passwordBigInt   = passwordIsRawBigInt ? (BigInt(password) % BN254_R) : await ParseProofUtils.derivePassword(password, globalSaltBigInt);

      const usernameHashHex = ParseProofUtils.hashStringForContract(usernameBigInt);

      const { nonce: nonceVal, commitment: storedCommitmentHex } = credentials;

      const storedCommitmentString = BigInt(storedCommitmentHex).toString();
      const usernameHashString     = BigInt(usernameHashHex).toString();

      const circuitInput = {
        email: usernameBigInt.toString(),
        password: passwordBigInt.toString(),
        salt: globalSaltBigInt.toString(),
        emailHash: usernameHashString,
        storedCommitment: storedCommitmentString,
        nonce: nonceVal.toString(),
      };

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInput,
        'assets/zk/Login.wasm',
        'assets/zk/Login_identities.zkey'
      );
      const { a, b, c, input: proofInput } = await ParseProofUtils.parseProof({ proof, publicSignals });

      // Use a fresh ephemeral wallet for the DID session — keeps it independent of the entity session.
      const didEphemeral = ethers.Wallet.createRandom();
      const message = ethers.solidityPacked(['string', 'address'], ['Set owner to:', didEphemeral.address]);
      const messageHash = ethers.keccak256(message);
      const signedMessage = await didEphemeral.signMessage(ethers.getBytes(messageHash));

      return {
        identityAddress,
        privateKey:     didEphemeral.privateKey,
        a:              a.map((x: bigint) => x.toString()),
        b:              b.map((row: bigint[]) => row.map((x: bigint) => x.toString())),
        c:              c.map((x: bigint) => x.toString()),
        proofInput:     proofInput.map((x: bigint) => x.toString()),
        signedMessage,
        sessionDuration,
      };
    } catch (error: any) {
      console.error('Identity login payload error:', error);
      return null;
    }
  }

}
