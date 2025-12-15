import { inject, Injectable } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';

import { CryptoService } from './crypto.service';
import { RpcService } from './rpc.service';

import { environment } from '../../../environments/environment';

import { ParseProofUtils } from '../utils/parse-proof.utils';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  private cryptoService = inject(CryptoService);
  private rpcService = inject(RpcService);

  apiURL = environment.apiURL;

  globalSalt = environment.globalSalt;

  async identityContactCheck(email: string, mobile: string) {
    try {

      const options = {
        url: this.apiURL + '/identity/check/contact',
        headers: {
          'Content-Type': 'application/json'
        },
      };      

      const data = {
        email,
        mobile
      };

      const response = await CapacitorHttp.request({ ...options, method: 'POST', data });
      if(!response.data.success) return null;
      return response.data.exists;
    }
    catch (error: any) {
      return null;
    }
  }

  async identityContactVarify(email: string, emailOTP: number, mobile: string, mobileOTP: number) {
    try {

      const options = {
        url: this.apiURL + '/identity/varify/otp',
        headers: {
          'Content-Type': 'application/json'
        },
      };      

      const data = {
        email, emailOTP, mobile, mobileOTP
      };

      const response = await CapacitorHttp.request({ ...options, method: 'POST', data });      
      if(!response.data.success) return null;
      return response.data;
    }
    catch (error: any) {
      return null;
    }
  }

  async identityVerifyNID(idFrontFile: File, idBackFile: File, contactData: string) {
    try {
      // Convert files to base64
      const idFrontBase64 = await this.fileToBase64(idFrontFile);
      const idBackBase64 = await this.fileToBase64(idBackFile);

      // Create FormData
      const formData = new FormData();
      formData.append('idFront', idFrontFile);
      formData.append('idBack', idBackFile);
      formData.append('contactData', contactData);

      // Use native fetch for FormData upload (CapacitorHttp doesn't handle FormData well)
      const response = await fetch(this.apiURL + '/identity/validate/nid', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      
      if (!data.success) return null;
      return data;
    }
    catch (error: any) {
      console.error('Error verifying NID:', error);
      return null;
    }
  }

  async identityRegister(idType: number, uniqueIdHash: string, email: string, mobile: string, password: string, metadata: string, validatorId: number) {
    try {

      const emailHash = await this.cryptoService.shaHash(email);
      const mobileHash = await this.cryptoService.shaHash(mobile);

      // Initialize ParseProofUtils
      await ParseProofUtils.init();
  
      // Convert to BigInts
      const emailBigInt = ParseProofUtils.stringToBigInt(email);
      const passwordBigInt = ParseProofUtils.passwordToBigInt(password);
      const globalSaltBigInt = BigInt(this.globalSalt);

      // Generate hashes for contract
      const emailHashHex = ParseProofUtils.hashStringForContract(emailBigInt);
      const secretHex = ParseProofUtils.generateCommitment(emailBigInt, passwordBigInt, globalSaltBigInt);      

      const options = {
        url: this.apiURL + '/identity/register',
        headers: {
          'Content-Type': 'application/json'
        },
      };      

      const data = {
        idType, uniqueIdHash, emailHash, mobileHash, 
        loginHash: emailHashHex, 
        secret: secretHex, 
        metadata, validatorId
      };

      const response = await CapacitorHttp.request({ ...options, method: 'POST', data });      
      console.log(response);
      if(!response.data.success) return null;
      return response.data;
    }
    catch (error: any) {
      return null;
    }
  }

  async ipfsFetchDataMeta(cid: string) {
    try {

      const options = {
        url: this.apiURL + '/ipfs/data/meta/' + cid,
        headers: {
          'Content-Type': 'application/json'
        },
      };      

      const response = await CapacitorHttp.request({ ...options, method: 'GET' });
      if(!response.data.success) return null;
      return response.data.data;
    }
    catch (error: any) {
      return null;
    }
  }

  async ipfsFetchDataImage(cid: string) {
    try {

      const options = {
        url: this.apiURL + '/ipfs/data/image/' + cid,
        headers: {
          'Content-Type': 'application/json'
        },
      };      

      const response = await CapacitorHttp.request({ ...options, method: 'GET' });
      if(!response.data.success) return null;
      return await this.base64ToImage(response.data.data);
    }
    catch (error: any) {
      return null;
    }
  }  

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  
  private async base64ToImage(base64: string): Promise<HTMLImageElement | null> {
    try {
      const image = new Image();
      image.src = `data:image/jpg;base64,${base64}`;
      await new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = () => resolve(null);
      });
      return image;
    } catch (error) {
      console.error('Error converting base64 to image:', error);
      return null;
    }
  }

}
