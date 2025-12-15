// @ts-ignore
import * as snarkjs from 'snarkjs';
import { ethers } from 'ethers';
import { poseidon1, poseidon3 } from 'poseidon-lite';

export interface ZKProofData {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
  input: bigint[];
}

export interface FullProof {
  proof: any;
  publicSignals: any[];
}

export class ParseProofUtils {
  private static initialized: boolean = false;

  static async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  private static checkInitialized(): void {
    if (!this.initialized) {
      throw new Error('ParseProofUtils not initialized. Call ParseProofUtils.init() first.');
    }
  }

  static async parseProof(fullProof: FullProof): Promise<ZKProofData> {
    try {
      const calldata = await snarkjs.groth16.exportSolidityCallData(
        fullProof.proof, 
        fullProof.publicSignals
      );
      
      const argv = calldata
        .replace(/["[\]\s]/g, "")
        .split(",")
        .map((x: string) => {
          if (!x.trim()) throw new Error('Empty value in calldata');
          return BigInt(x);
        });

      if (argv.length < 9) {
        throw new Error('Invalid calldata length');
      }

      const a: [bigint, bigint] = [argv[0], argv[1]];
      const b: [[bigint, bigint], [bigint, bigint]] = [
        [argv[2], argv[3]], 
        [argv[4], argv[5]]
      ];
      const c: [bigint, bigint] = [argv[6], argv[7]];
      const input: bigint[] = argv.slice(8);

      return { a, b, c, input };
    } catch (error) {
      throw new Error(`Failed to parse proof: ${error}`);
    }
  }

  static stringToBigInt(email: string): bigint {
    try {
      const emailBytes = ethers.toUtf8Bytes(email);
      return BigInt(ethers.keccak256(emailBytes));
    } catch (error) {
      throw new Error(`Failed to convert string to bigint: ${error}`);
    }
  }

  static passwordToBigInt(password: string): bigint {
    try {
      const passwordBytes = ethers.toUtf8Bytes(password);
      return BigInt(ethers.keccak256(passwordBytes));
    } catch (error) {
      throw new Error(`Failed to convert password to bigint: ${error}`);
    }
  }

  static hashStringForContract(emailBigInt: bigint): string {
    this.checkInitialized();
    
    try {
      // Use poseidon1 for single input
      const hash = poseidon1([emailBigInt]);
      
      return ethers.zeroPadValue(ethers.toBeArray(hash), 32);
    } catch (error) {
      throw new Error(`Failed to hash string for contract: ${error}`);
    }
  }

  static generateCommitment(emailBigInt: bigint, passwordBigInt: bigint, salt: bigint): string {
    this.checkInitialized();
    
    try {
      // Use poseidon3 for three inputs
      const commitment = poseidon3([emailBigInt, passwordBigInt, salt]);
      
      return ethers.zeroPadValue(ethers.toBeArray(commitment), 32);
    } catch (error) {
      throw new Error(`Failed to generate commitment: ${error}`);
    }
  }
}