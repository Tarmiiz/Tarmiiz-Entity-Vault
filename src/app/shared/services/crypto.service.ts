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

  // rsa encryption functions
  
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
  
  // aes encryption functions

  async aesEncrypt(key: string, payload: string): Promise<string> {
    try {
      const keyBuffer = await this.deriveAESKey(key);
      const iv = window.crypto.getRandomValues(new Uint8Array(12)); // GCM standard uses 12-byte IV
      
      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );

      const encodedData = new TextEncoder().encode(payload);
      const encryptedData = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 }, // 128-bit authentication tag
        cryptoKey,
        encodedData
      );

      // Combine IV + encrypted data (IV is needed for decryption)
      const combined = new Uint8Array(iv.length + encryptedData.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encryptedData), iv.length);
      
      return this.arrayBufferToHex(combined.buffer);
    } catch (error) {
      console.error('AES Encryption Error:', error);
      throw error;
    }
  }

  async aesDecrypt(key: string, payload: string): Promise<string> {
    try {
      const keyBuffer = await this.deriveAESKey(key);
      const combined = this.hexToArrayBuffer(payload);
      
      // Extract IV (first 12 bytes) and encrypted data
      const iv = combined.slice(0, 12);
      const encryptedData = combined.slice(12);
      
      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const decryptedData = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        cryptoKey,
        encryptedData
      );

      return new TextDecoder().decode(decryptedData);
    } catch (error) {
      console.error('AES Decryption Error:', error);
      throw error;
    }
  }

  private async deriveAESKey(key: string): Promise<ArrayBuffer> {
    // Derive 256-bit key from string using SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return hashBuffer; // Full 256 bits for AES-256-GCM
  }

  private arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private hexToArrayBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes.buffer;
  }

}