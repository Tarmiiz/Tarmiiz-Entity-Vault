import { inject, Injectable } from '@angular/core';
import { ethers } from 'ethers';
// @ts-ignore
import * as snarkjs from 'snarkjs';

import GlobalVariablesAbi from '../../../assets/ABIs/GlobalVariablesProxy.json';
import EntityTemplateAbi from '../../../assets/ABIs/EntityTemplate.json';

import { Key } from '../models/data.model';

import { StorageService } from './storage.service';

import { ParseProofUtils } from '../utils/parse-proof.utils';


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
  // Used during the claim flow to set the new commitment with the entity API's salt + the
  // user's chosen password (split out so the wizard can pre-compute it before posting).
  async computeCommitment(username: string, password: string, salt?: string): Promise<string | null> {
    try {
      await ParseProofUtils.init();
      const usernameBigInt = ParseProofUtils.stringToBigInt(username);
      const passwordBigInt = ParseProofUtils.passwordToBigInt(password);
      const saltBigInt     = BigInt(salt ?? this.globalSalt);
      return ParseProofUtils.generateCommitment(usernameBigInt, passwordBigInt, saltBigInt);
    } catch (error: any) {
      console.error('computeCommitment error:', error);
      return null;
    }
  }

  // Pure (no chain): the bytes32 loginHash EntityTemplate keys a user's credentials by. ApiService
  // uses this to fetch { nonce, commitment } from the Entity API before building the login payload,
  // so login never reads the RPC node directly.
  async computeLoginHash(username: string): Promise<string> {
    await ParseProofUtils.init();
    const usernameBigInt = ParseProofUtils.stringToBigInt(username);
    return ParseProofUtils.hashStringForContract(usernameBigInt);
  }

  // `saltOverride` lets the bootstrap admin claim wizard run a login proof against the regulator
  // API's salt (recorded on chain as EntityTemplate.bootstrapSalt) instead of the entity API's.
  // `passwordIsRawBigInt` — when true, treat `password` as a decimal numeric string (e.g. a 6-digit
  // OTP) and use `BigInt(password)` directly instead of `passwordToBigInt`. The Regulator API
  // computes the bootstrap commitment with `BigInt(otp)`, so the claim wizard must match.
  // `credentials` — { nonce, commitment } fetched by ApiService through the Entity API so login
  // never hits the RPC node (the Vault has no route to it). Required.
  async createLoginPayload(username: string, password: string, sessionDuration: number, saltOverride: string | undefined, passwordIsRawBigInt: boolean, credentials: { nonce: string | number; commitment: string }) {
    try {
      if (!username || !password || !credentials) return null;
      if (!Number.isInteger(sessionDuration) || sessionDuration <= 0) return null;

      // Initialize ParseProofUtils
      await ParseProofUtils.init();

      // Convert credentials to BigInts
      const usernameBigInt = ParseProofUtils.stringToBigInt(username);
      const passwordBigInt = passwordIsRawBigInt ? BigInt(password) : ParseProofUtils.passwordToBigInt(password);
      const globalSaltBigInt = BigInt(saltOverride ?? this.globalSalt);

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
        "assets/zk/Login_final.zkey"
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
  async createIdentityLoginPayload(identityAddress: string, username: string, password: string, sessionDuration: number, saltOverride: string | undefined, passwordIsRawBigInt: boolean, credentials: { nonce: string | number; commitment: string }) {
    try {
      if (!identityAddress || !username || !password || !credentials) return null;
      if (!Number.isInteger(sessionDuration) || sessionDuration <= 0) return null;

      await ParseProofUtils.init();

      const usernameBigInt   = ParseProofUtils.stringToBigInt(username);
      const passwordBigInt   = passwordIsRawBigInt ? BigInt(password) : ParseProofUtils.passwordToBigInt(password);
      const globalSaltBigInt = BigInt(saltOverride ?? this.globalSalt);

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
        'assets/zk/Login_final.zkey'
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
