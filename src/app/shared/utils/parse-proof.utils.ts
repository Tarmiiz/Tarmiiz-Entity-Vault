// @ts-ignore
import * as snarkjs from 'snarkjs';
import { ethers } from 'ethers';
// @ts-ignore
import * as circomlibjs from 'circomlibjs';

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
  private static poseidon: any = null;
  private static initialized: boolean = false;

  // Better initialization with error handling
  static async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.poseidon = await circomlibjs.buildPoseidon();
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Poseidon: ${error}`);
    }
  }

  // Ensure Poseidon is initialized before any operation
  private static checkInitialized(): void {
    if (!this.initialized || !this.poseidon) {
      throw new Error('Poseidon not initialized. Call ParseProofUtils.init() first.');
    }
  }

  // Better typed parseProof function
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

  // Original functions with better error handling
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
      const hash = this.poseidon([emailBigInt]);
      const hashString = this.poseidon.F.toString(hash, 10);
      const hashBigInt = BigInt(hashString);
      
      return ethers.zeroPadValue(ethers.toBeArray(hashBigInt), 32);
    } catch (error) {
      throw new Error(`Failed to hash string for contract: ${error}`);
    }
  }

  static generateCommitment(emailBigInt: bigint, passwordBigInt: bigint, salt: bigint): string {
    this.checkInitialized();
    
    try {
      const commitment = this.poseidon([emailBigInt, passwordBigInt, salt]);
      const commitmentString = this.poseidon.F.toString(commitment, 10);
      const commitmentBigInt = BigInt(commitmentString);
      
      return ethers.zeroPadValue(ethers.toBeArray(commitmentBigInt), 32);
    } catch (error) {
      throw new Error(`Failed to generate commitment: ${error}`);
    }
  }
}