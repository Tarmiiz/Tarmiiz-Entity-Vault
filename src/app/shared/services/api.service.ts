import { inject, Injectable } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';

import { CryptoService } from './crypto.service';
import { EthersService } from './ethers.service';

import { environment } from '../../../environments/environment';

import { ParseProofUtils } from '../utils/parse-proof.utils';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  private cryptoService = inject(CryptoService);
  private ethersService = inject(EthersService);

  apiURL = environment.apiURL;
  vaultToken = environment.vaultToken;

  globalSalt = environment.globalSalt;

  // ─── Vault — Config (unauthenticated) ────────────────────────────────────────

  async vaultGetConfig(): Promise<{ rpcNode: string; entityContract: string; globalVariablesProxyContract: string } | null> {
    try {
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + '/vault/config',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.data?.type !== 'success') return null;
      return response.data.config ?? null;
    } catch {
      return null;
    }
  }

  // ─── Vault helpers ────────────────────────────────────────────────────────────

  private async vaultGet(path: string, params?: Record<string, any>) {
    try {
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + '/vault' + path,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.vaultToken,
        },
        params,
      });
      if (response.data?.type !== 'success') return null;
      return response.data;
    } catch {
      return null;
    }
  }

  private async vaultPost(path: string, body: Record<string, any>) {
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/vault' + path,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.vaultToken,
        },
        data: body,
      });
      if (response.data?.type !== 'success') return null;
      return response.data;
    } catch {
      return null;
    }
  }

  private async vaultDelete(path: string) {
    try {
      const response = await CapacitorHttp.request({
        method: 'DELETE',
        url: this.apiURL + '/vault' + path,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.vaultToken,
        },
      });
      if (response.data?.type !== 'success') return null;
      return response.data;
    } catch {
      return null;
    }
  }

  private async vaultPut(path: string, body: Record<string, any>) {
    try {
      const response = await CapacitorHttp.request({
        method: 'PUT',
        url: this.apiURL + '/vault' + path,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.vaultToken,
        },
        data: body,
      });
      if (response.data?.type !== 'success') return null;
      return response.data;
    } catch {
      return null;
    }
  }

  // ─── Vault — Assets ───────────────────────────────────────────────────────────

  async vaultGetAssets(start = 0, offset = 50, service?: string) {
    const params: Record<string, any> = { start, offset };
    if (service) params['service'] = service;
    const data = await this.vaultGet('/assets', params);
    return data ? { count: data.count, assets: data.assets } : null;
  }

  async vaultGetAsset(address: string) {
    const data = await this.vaultGet('/assets/' + address);
    return data?.asset ?? null;
  }

  async vaultGetAssetPrice(address: string) {
    const data = await this.vaultGet('/assets/' + address + '/price');
    return data?.price ?? null;
  }

  async vaultGetAssetPriceHistory(address: string, start = 0, offset = 50) {
    const data = await this.vaultGet('/assets/' + address + '/price/history', { start, offset });
    return data ? { count: data.count, history: data.history } : null;
  }

  async vaultGetAssetServices(address: string) {
    const data = await this.vaultGet('/assets/' + address + '/services');
    return data?.services ?? null;
  }

  async vaultGetAssetHolders(address: string, start = 0, offset = 500) {
    const data = await this.vaultGet('/assets/' + address + '/holders', { start, offset });
    return data ? { count: data.count, holders: data.holders } : null;
  }

  // ─── Vault — Transactions ─────────────────────────────────────────────────────

  async vaultGetTransactions(filters?: { asset?: string; service?: string; subscription?: string; startTime?: number; endTime?: number }, start = 0, offset = 50) {
    const params: Record<string, any> = { start, offset };
    if (filters?.asset) params['asset'] = filters.asset;
    if (filters?.service) params['service'] = filters.service;
    if (filters?.subscription) params['subscription'] = filters.subscription;
    if (filters?.startTime) params['startTime'] = filters.startTime;
    if (filters?.endTime) params['endTime'] = filters.endTime;
    const data = await this.vaultGet('/transactions', params);
    return data ? { count: data.count, transactions: data.transactions } : null;
  }

  async vaultGetTransaction(id: number) {
    const data = await this.vaultGet('/transactions/' + id);
    return data?.transaction ?? null;
  }

  // ─── Vault — Services ─────────────────────────────────────────────────────────

  async vaultGetServices(start = 0, offset = 50) {
    const data = await this.vaultGet('/services', { start, offset });
    return data ? { count: data.count, services: data.services } : null;
  }

  async vaultGetService(address: string) {
    const data = await this.vaultGet('/services/' + address);
    return data?.service ?? null;
  }

  // ─── Vault — Subscriptions ────────────────────────────────────────────────────

  async vaultGetSubscriptions(service?: string, start = 0, offset = 50) {
    const params: Record<string, any> = { start, offset };
    if (service) params['service'] = service;
    const data = await this.vaultGet('/subscriptions', params);
    return data ? { count: data.count, subscriptions: data.subscriptions } : null;
  }

  async vaultGetSubscription(address: string) {
    const data = await this.vaultGet('/subscriptions/' + address);
    return data?.subscription ?? null;
  }

  async vaultGetSubscriptionHoldings(address: string, start = 0, offset = 500) {
    const data = await this.vaultGet('/subscriptions/' + address + '/holdings', { start, offset });
    return data ? { count: data.count, holdings: data.holdings } : null;
  }

  // ─── Vault — Dashboard ───────────────────────────────────────────────────────

  async vaultGetDashboardSummary() {
    const data = await this.vaultGet('/dashboard/summary');
    return data ?? null;
  }

  // ─── Vault — Sync ─────────────────────────────────────────────────────────────

  async vaultGetSyncStatus() {
    const data = await this.vaultGet('/sync/status');
    return data?.status ?? null;
  }

  // ─── Vault — Asset writes ─────────────────────────────────────────────────────

  async vaultCreateAsset(body: Record<string, any>): Promise<{ type: string; error?: string; address?: string } | null> {
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/vault/assets',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.vaultToken,
        },
        data: body,
      });
      return response.data ?? null;
    } catch {
      return null;
    }
  }

  async vaultUpdateAssetState(address: string, state: number) {
    const data = await this.vaultPut('/assets/' + address + '/state', { state });
    return data ?? null;
  }

  async vaultAddAssetService(assetAddress: string, serviceAddress: string) {
    const data = await this.vaultPost('/assets/' + assetAddress + '/services', { service: serviceAddress });
    return data ?? null;
  }

  async vaultRemoveAssetService(assetAddress: string, serviceAddress: string) {
    const data = await this.vaultDelete('/assets/' + assetAddress + '/services/' + serviceAddress);
    return data ?? null;
  }

  // ─── Vault — Service writes ───────────────────────────────────────────────────

  async vaultCreateService(body: Record<string, any>) {
    const data = await this.vaultPost('/services', body);
    return data ?? null;
  }

  async vaultUpdateServiceName(address: string, name: string) {
    const data = await this.vaultPut('/services/' + address + '/name', { name });
    return data ?? null;
  }

  async vaultUpdateServiceData(address: string, body: Record<string, any>) {
    const data = await this.vaultPut('/services/' + address + '/data', body);
    return data ?? null;
  }

  async vaultUpdateServiceState(address: string, state: number) {
    const data = await this.vaultPut('/services/' + address + '/state', { state });
    return data ?? null;
  }

  // ─── Vault — Subscription writes ─────────────────────────────────────────────

  async vaultUpdateSubscriptionState(address: string, state: number) {
    const data = await this.vaultPut('/subscriptions/' + address + '/state', { state });
    return data ?? null;
  }

  async vaultGetSubscriptionIdentityHash(address: string) {
    const data = await this.vaultGet('/subscriptions/' + address + '/identity-hash');
    return data?.identityHash ?? null;
  }

  // ─── Vault — Users ────────────────────────────────────────────────────────────

  async vaultGetUsers(start = 0, offset = 50) {
    const data = await this.vaultGet('/users', { start, offset });
    return data ? { count: data.count, users: data.users } : null;
  }

  async vaultGetUser(id: string) {
    const data = await this.vaultGet('/users/' + id);
    return data?.user ?? null;
  }

  async vaultCreateUser(body: Record<string, any>) {
    const data = await this.vaultPost('/users', body);
    return data ?? null;
  }

  async vaultUpdateUserData(id: string, body: Record<string, any>) {
    const data = await this.vaultPut('/users/' + id + '/data', body);
    return data ?? null;
  }

  async vaultUpdateUserState(id: string, state: number) {
    const data = await this.vaultPut('/users/' + id + '/state', { state });
    return data ?? null;
  }

  async vaultUpdateUserRole(id: string, role: number) {
    const data = await this.vaultPut('/users/' + id + '/role', { role });
    return data ?? null;
  }

  async vaultUpdateUserPassword(id: string, username: string, password: string) {
    const data = await this.vaultPut('/users/' + id + '/password', { username, password });
    return data ?? null;
  }

  async vaultUpdateUserCredentials(id: string, body: Record<string, any>) {
    const data = await this.vaultPut('/users/' + id + '/credentials', body);
    return data ?? null;
  }

  // ─── Vault — Reference data ───────────────────────────────────────────────────

  async vaultGetServicesOwn(start = 0, offset = 50) {
    const data = await this.vaultGet('/services/own', { start, offset });
    return data ? { count: data.count, services: data.services } : null;
  }

  async vaultGetCountries() {
    const data = await this.vaultGet('/countries');
    return data?.countries ?? null;
  }

  async vaultGetGlobalVariables() {
    const data = await this.vaultGet('/global-variables');
    return data?.variables ?? null;
  }

  async vaultGetGlobalVariablesByCategory(category: string) {
    const data = await this.vaultGet('/global-variables/' + encodeURIComponent(category));
    return data?.variables ?? null;
  }

  async vaultGetRegulatorsByCountry(countryCode: string, start = 0, offset = 100) {
    const data = await this.vaultGet('/regulators/' + countryCode, { start, offset });
    return data?.regulators ?? null;
  }

  // ─── Vault — Entity auth ──────────────────────────────────────────────────────

  async entityLogin(username: string, password: string, sessionDuration: number) {
    const payload = await this.ethersService.createLoginPayload(username, password, sessionDuration);
    if (!payload) return { success: false, error: 'Proof generation failed' };
    const { key, ...rest } = payload;
    const data = await this.vaultPost('/entity/login', { ...rest, privateKey: key.privateKey });
    if (!data) return { success: false, error: 'Login API call failed' };
    return { success: true, userId: data.userId, key };
  }

  async entityLogout() {
    const data = await this.vaultPost('/entity/logout', {});
    return data ?? null;
  }

  async vaultGetEntityInfo() {
    const data = await this.vaultGet('/entity/info');
    return data?.entity ?? null;
  }

  async vaultUpdateEntityMetadata(metadata: Record<string, any>) {
    const data = await this.vaultPut('/entity/metadata', { metadata });
    return data ?? null;
  }

  async vaultGetExternalContract(name: string) {
    const data = await this.vaultGet('/entity/external-contract/' + name);
    return data?.address ?? null;
  }

  async vaultSetExternalContract(name: string, address: string) {
    const data = await this.vaultPut('/entity/external-contract/' + name, { address });
    return data ?? null;
  }

  // ─── Vault — Global controller ────────────────────────────────────────────────

  async vaultGetGlobalCountries(search?: string) {
    const params: Record<string, any> = {};
    if (search) params['search'] = search;
    const data = await this.vaultGet('/global/countries', params);
    return data ? { count: data.count as number, countries: data.countries as any[] } : null;
  }

  async vaultGetGlobalCountry(id: number) {
    const data = await this.vaultGet('/global/countries/' + id);
    return data?.country ?? null;
  }

  async vaultGetGlobalCategories() {
    const data = await this.vaultGet('/global/categories');
    return data ? { count: data.count as number, categories: data.categories as string[] } : null;
  }

  async vaultGetGlobalVariablesList(category: string, visibleOnly?: boolean) {
    const params: Record<string, any> = { category };
    if (visibleOnly !== undefined) params['visible'] = String(visibleOnly);
    const data = await this.vaultGet('/global/variables', params);
    return data ? { count: data.count as number, variables: data.variables as any[] } : null;
  }

  async vaultGetGlobalSyncStatus() {
    const data = await this.vaultGet('/global/sync/status');
    return data ?? null;
  }

  async vaultTriggerGlobalSync() {
    const data = await this.vaultPost('/global/sync/trigger', {});
    return data ?? null;
  }

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
