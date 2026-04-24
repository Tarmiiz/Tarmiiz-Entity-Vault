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

  async getGlobalVariableByCategory(category: string) {
    try {
      const result = await this.variablesProxyContract.variablesListByCategory(category);
      if(result) {
        const variables = result.map((variable: any) => ({
          variableId: Number(variable[0]),
          name: variable[1],
          visible: variable[2],
        }))
        return { result: variables, error: ''};
      }
      else {
        return { result: null, error: 'Error fetching variables list'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching variables list'};
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

  async createLoginPayload(username: string, password: string, sessionDuration: number = 3600) {
    try {
      if (!username || !password) return null;
      if (!Number.isInteger(sessionDuration) || sessionDuration <= 0) return null;

      // Initialize ParseProofUtils
      await ParseProofUtils.init();

      // Convert credentials to BigInts
      const usernameBigInt = ParseProofUtils.stringToBigInt(username);
      const passwordBigInt = ParseProofUtils.passwordToBigInt(password);
      const globalSaltBigInt = BigInt(this.globalSalt);

      // Generate contract lookup hash
      const usernameHashHex = ParseProofUtils.hashStringForContract(usernameBigInt);

      // Get nonce and stored commitment
      const { nonce, commitment: storedCommitmentHex } = await this.entityContract.getUserCredentialsData(usernameHashHex);

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

}
