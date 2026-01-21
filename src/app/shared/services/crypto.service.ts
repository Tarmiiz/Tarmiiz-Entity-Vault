import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CryptoService {

  constructor() { }

  async shaHash(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  // RSA encryption functions (already compatible)
  
  async generateRSAKey(): Promise<{ publicKey: JsonWebKey, privateKey: JsonWebKey }> {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );

    const publicKey = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privateKey = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);

    return { publicKey, privateKey };
  }

  async rsaEncrypt(data: string, publicKey: JsonWebKey): Promise<string> {
    const key = await window.crypto.subtle.importKey(
      'jwk',
      publicKey,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256',
      },
      true,
      ['encrypt']
    );

    const encodedData = new TextEncoder().encode(data);

    const encryptedData = await window.crypto.subtle.encrypt(
      {
        name: 'RSA-OAEP',
      },
      key,
      encodedData
    );

    return this.arrayBufferToBase64(encryptedData);
  }

  async rsaDecrypt(encryptedData: string, privateKey: JsonWebKey): Promise<string> {
    const key = await window.crypto.subtle.importKey(
      'jwk',
      privateKey,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256',
      },
      true,
      ['decrypt']
    );

    const data = this.base64ToArrayBuffer(encryptedData);

    const decryptedData = await window.crypto.subtle.decrypt(
      {
        name: 'RSA-OAEP',
      },
      key,
      data
    );

    return new TextDecoder().decode(decryptedData);
  }

  // AES encryption functions (FIXED to match Node.js implementation)

  /**
   * Generates a 256-bit AES key and exports it as a JWK (matching Node.js)
   */
  async generateAESKeyJWK(): Promise<JsonWebKey> {
    const key = await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    );

    return await window.crypto.subtle.exportKey('jwk', key);
  }

  /**
   * Helper to construct a full JWK from just the 'k' value
   */
  private constructAESKeyJWK(kValue: string): JsonWebKey {
    return {
      kty: 'oct',
      k: kValue,
      alg: 'A256GCM',
      ext: true,
      key_ops: ['encrypt', 'decrypt']
    };
  }

  /**
   * Encrypts payload using AES-GCM with JWK key (matching Node.js)
   * Returns Base64 string: IV (12 bytes) + Ciphertext + AuthTag (16 bytes)
   * @param keyJwkOrK - Either a full JsonWebKey object or just the 'k' string value
  */
  async aesEncrypt(keyJwkOrK: JsonWebKey | string, payload: string): Promise<string> {
    try {
      // If it's a string, construct the full JWK
      const keyJwk = typeof keyJwkOrK === 'string' 
        ? this.constructAESKeyJWK(keyJwkOrK)
        : keyJwkOrK;

      // Import the JWK key
      const key = await window.crypto.subtle.importKey(
        'jwk',
        keyJwk,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );

      // Generate 12-byte IV (same as Node.js IV_LENGTH)
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      
      const encodedData = new TextEncoder().encode(payload);
      
      // Encrypt with AES-GCM (auth tag is automatically appended by Web Crypto API)
      const encryptedData = await window.crypto.subtle.encrypt(
        { 
          name: 'AES-GCM', 
          iv,
          tagLength: 128  // 16 bytes = 128 bits (same as Node.js AUTH_TAG_LENGTH)
        },
        key,
        encodedData
      );

      // Combine IV + encrypted data (which includes the auth tag at the end)
      // Structure: IV (12) + Ciphertext + AuthTag (16)
      const combined = new Uint8Array(iv.length + encryptedData.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encryptedData), iv.length);
      
      // Return as Base64 (matching Node.js)
      return this.arrayBufferToBase64(combined.buffer);
    } catch (error) {
      console.error('AES Encryption Error:', error);
      throw error;
    }
  }

  /**
   * Decrypts payload encrypted by Node.js (matching Node.js structure)
   * Expects Base64 string: IV (12 bytes) + Ciphertext + AuthTag (16 bytes)
   * @param keyJwkOrK - Either a full JsonWebKey object or just the 'k' string value
   */
  async aesDecrypt(keyJwkOrK: JsonWebKey | string, payload: string): Promise<string> {
    try {
      // If it's a string, construct the full JWK
      const keyJwk = typeof keyJwkOrK === 'string' 
        ? this.constructAESKeyJWK(keyJwkOrK)
        : keyJwkOrK;

      // Import the JWK key
      const key = await window.crypto.subtle.importKey(
        'jwk',
        keyJwk,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      // Decode Base64 payload
      const combined = this.base64ToArrayBuffer(payload);
      
      // Extract IV (first 12 bytes)
      const iv = combined.slice(0, 12);
      
      // The rest is ciphertext + auth tag (Web Crypto API expects them together)
      const encryptedData = combined.slice(12);
      
      const decryptedData = await window.crypto.subtle.decrypt(
        { 
          name: 'AES-GCM', 
          iv,
          tagLength: 128
        },
        key,
        encryptedData
      );

      return new TextDecoder().decode(decryptedData);
    } catch (error) {
      console.error('AES Decryption Error:', error);
      throw error;
    }
  }

  // Helper functions for Base64 encoding/decoding

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }
}