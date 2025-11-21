const snarkjs = require('snarkjs');
const { ethers } = require('ethers');
const circomlibjs   = require('circomlibjs');

let poseidon;
(async () => {
    poseidon = await circomlibjs.buildPoseidon();
})();

async function parseProof(fullProof) {
  const calldata = await snarkjs.groth16.exportSolidityCallData(fullProof.proof, fullProof.publicSignals);
  const argv = calldata.replace(/["[\]\s]/g, "").split(",").map((x) => BigInt(x));
  const a = [argv[0], argv[1]];
  const b = [[argv[2], argv[3]], [argv[4], argv[5]]];
  const c = [argv[6], argv[7]];
  const input = [];
  for (let i = 8; i < argv.length; i++) {
    input.push(argv[i]);
  }
  return { a, b, c, input };
}

// Simplified helper functions
function stringToBigInt(email) {
    const emailBytes = ethers.toUtf8Bytes(email);
    return BigInt(ethers.keccak256(emailBytes));
}

function passwordToBigInt(password) {
    const passwordBytes = ethers.toUtf8Bytes(password);
    return BigInt(ethers.keccak256(passwordBytes));
}

function hashStringForContract(emailBigInt) {
    const hash = poseidon([emailBigInt]);
    const hashString = poseidon.F.toString(hash, 10);
    const hashBigInt = BigInt(hashString);
    
    // Ensure proper 32-byte padding
    return ethers.zeroPadValue(ethers.toBeArray(hashBigInt), 32);
}

function generateCommitment(emailBigInt, passwordBigInt, salt) {
    const commitment = poseidon([emailBigInt, passwordBigInt, salt]);
    const commitmentString = poseidon.F.toString(commitment, 10);
    const commitmentBigInt = BigInt(commitmentString);
    
    // Ensure 32-byte padding
    return ethers.zeroPadValue(ethers.toBeArray(commitmentBigInt), 32);
}

module.exports = {
  parseProof, 
  stringToBigInt, 
  passwordToBigInt, 
  hashStringForContract, 
  generateCommitment
};