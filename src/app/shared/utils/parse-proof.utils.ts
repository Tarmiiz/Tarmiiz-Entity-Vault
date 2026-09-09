// @ts-ignore
import * as snarkjs from 'snarkjs';
import { ethers } from 'ethers';
import { poseidon1, poseidon2, poseidon3 } from 'poseidon-lite';
import { argon2id } from 'hash-wasm';

/*
    Tarmiiz ZK login — CLIENT DERIVATION (reference copy: Tarmiiz ZK/Circuits/Login/clients/).

    ⚠️ BYTE-IDENTICAL COPIES live in every frontend's `src/app/shared/utils/parse-proof.utils.ts`
    (Entity Vault, Regulator Dashboard, DID App, Token Exchange; the two registration portals
    carry `parse-proof.slim.utils.ts`, the same file minus `parseProof`/snarkjs).
    `Tarmiiz ZK/Circuits/Login/scripts/check-clients.mjs` fails when any copy drifts — because a
    copy that derives a DIFFERENT commitment from the same password does not error, it locks the
    user out with "invalid zk proof" and nothing says which side is wrong.

    THE DERIVATION (Phase 18: H1 Argon2id · 18.B1 in-circuit stretch · 18.B4 per-user salt):

        emailBI    = keccak256(utf8(email))                                  (as before)
        loginHash  = Poseidon1(emailBI)                                      (as before)
        p          = Argon2id(password, salt=BE32(salt), m=64 MiB, t=3, p=1, 32 bytes)
        p'         = BigInt(p) mod r                                         (r = BN254 scalar field)
        commitment = Poseidon3(emailBI, stretch(p', salt), salt)
        stretch(x) = Poseidon2([·, salt]) applied STRETCH_ROUNDS times to x   (the circuit does this
                                                                             in-statement; we do it
                                                                             here to STORE the value)
        witness    = { email: emailBI, password: p', salt }                  (PRE-stretch p')

    🔴 EVERY CONSTANT BELOW IS FROZEN. Argon2id parameters, STRETCH_ROUNDS and the mod-r rule
    decide the commitment; changing any of them changes every stored commitment and lands only
    with a clean redeploy plus a lockstep edit of every copy and of `circuits/Login.circom`.

    ⚠️ `salt` is the CREDENTIAL's own salt (per user since 18.B4), read from the credentials
    fetch before login — never `environment.globalSalt`. Server-known placeholders (the bootstrap
    OTP) skip Argon2id and pass the raw BigInt as `p'`; the stretch still applies to them.
*/

export const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const STRETCH_ROUNDS = 5;
export const ARGON2 = Object.freeze({ memorySize: 65536, iterations: 3, parallelism: 1, hashLength: 32 });

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

  // ---- derivation: byte-identical in every copy ---------------------------------------------

  static stringToBigInt(email: string): bigint {
    try {
      const emailBytes = ethers.toUtf8Bytes(email);
      return BigInt(ethers.keccak256(emailBytes));
    } catch (error) {
      throw new Error(`Failed to convert string to bigint: ${error}`);
    }
  }

  /** 32-byte big-endian encoding of a field element — the Argon2id salt input. */
  static saltToBytes(salt: bigint): Uint8Array {
    return ethers.getBytes(ethers.zeroPadValue(ethers.toBeArray(salt % BN254_R), 32));
  }

  /** A fresh per-credential salt, ALREADY REDUCED mod r (a raw 256-bit value exceeds r ~75% of the time). */
  static randomSalt(): bigint {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return BigInt(ethers.hexlify(bytes)) % BN254_R;
  }

  /**
   * H1 — Argon2id over the password with the credential's salt, reduced mod r.
   * This replaces the pre-Phase-18 `passwordToBigInt` (a single keccak), which is deliberately
   * GONE so every stale caller fails to compile rather than silently deriving the old value.
   */
  static async derivePassword(password: string, salt: bigint): Promise<bigint> {
    const hex = await argon2id({
      password,
      salt: this.saltToBytes(salt),
      parallelism: ARGON2.parallelism,
      iterations: ARGON2.iterations,
      memorySize: ARGON2.memorySize,
      hashLength: ARGON2.hashLength,
      outputType: 'hex',
    });
    return BigInt('0x' + hex) % BN254_R;
  }

  /** 18.B1 — the off-circuit twin of the circuit's stretch. Input is the PRE-stretch p'. */
  static stretch(passwordBigInt: bigint, salt: bigint): bigint {
    let st = passwordBigInt % BN254_R;
    const s = salt % BN254_R;
    for (let i = 0; i < STRETCH_ROUNDS; i++) st = poseidon2([st, s]);
    return st;
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

  /**
   * The STORED commitment. `passwordBigInt` is the PRE-stretch value (`derivePassword` output, or
   * a server-known raw placeholder); the stretch is applied here exactly as the circuit applies
   * it, so the witness passes the pre-stretch value and the circuit lands on this commitment.
   */
  static generateCommitment(emailBigInt: bigint, passwordBigInt: bigint, salt: bigint): string {
    this.checkInitialized();

    try {
      const commitment = poseidon3([emailBigInt, this.stretch(passwordBigInt, salt), salt % BN254_R]);

      return ethers.zeroPadValue(ethers.toBeArray(commitment), 32);
    } catch (error) {
      throw new Error(`Failed to generate commitment: ${error}`);
    }
  }
}
