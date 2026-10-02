import { ethers } from 'ethers';

/*
    Tarmiiz ZK login — the NONCE BINDING (Security A1, 2026-10-02).
    Reference copy: Tarmiiz ZK/Circuits/Login/clients/login-nonce.utils.ts.

    ⚠️ BYTE-IDENTICAL COPIES live in `src/app/shared/utils/login-nonce.utils.ts` of every frontend
    that SENDS a login proof (Entity Vault, Regulator Dashboard, Token Exchange), guarded by
    `scripts/check-clients.mjs`. The Node twin is `bindNonce` in `clients/loginDerive.js`.
    It is a separate file from `parse-proof.utils.ts` on purpose: that file's copy set includes the
    DID App, which is out of scope by product ruling (2026-09-22) and was not changed.

        nonceInput = keccak256(abi.encode(verifier, sender, storedNonce)) mod r

    `verifier` = the template whose LoginVerifier checks the proof (EntityTemplate /
    RegulatorTemplate / IdentityTemplate); `sender` = the address that SENDS the transaction
    (`msg.sender` — the per-session ephemeral wallet). `UsersLib._boundNonce` /
    `CredentialsLib._boundNonce` recompute it on chain, so a proof copied out of the tx pool and
    resubmitted from another wallet no longer verifies. Pass the result as the witness `nonce`.
    A client that computes it differently does not error — its login fails with "nonce mismatch".
*/

export const BN254_R_NONCE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export function bindLoginNonce(verifier: string, sender: string, storedNonce: bigint | number | string): bigint {
  if (!ethers.isAddress(verifier)) throw new Error(`bindLoginNonce: verifier is not an address (${verifier})`);
  if (!ethers.isAddress(sender)) throw new Error(`bindLoginNonce: sender is not an address (${sender})`);
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint256'],
    [verifier, sender, BigInt(storedNonce)]
  );
  return BigInt(ethers.keccak256(encoded)) % BN254_R_NONCE;
}
