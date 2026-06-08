import { inject, Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { CapacitorHttp } from '@capacitor/core';

import { CryptoService } from './crypto.service';
import { EthersService } from './ethers.service';
import { ConfigService } from './config.service';
import { SessionService } from './session.service';

import { ParseProofUtils } from '../utils/parse-proof.utils';
import { FeeConfig } from '../models/data.model';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  private cryptoService = inject(CryptoService);
  private ethersService = inject(EthersService);
  private configService = inject(ConfigService);
  private sessionService = inject(SessionService);
  private router = inject(Router);
  private injector = inject(Injector);

  // Tracks whether we've already kicked off the auth-expired redirect, so a
  // burst of in-flight 401s doesn't spam the alert / navigate repeatedly.
  private _authExpiredHandled = false;

  // Called whenever an authenticated request returns 401. Clears the cached
  // session and bounces the user to the login page so the silent-401 trap
  // (server restart wipes in-memory sessions) surfaces immediately instead of
  // leaving every page rendering as empty data with misleading error toasts.
  private async _handleAuthFailure(): Promise<void> {
    if (this._authExpiredHandled) return;
    this._authExpiredHandled = true;
    try { await this.sessionService.clear(); } catch (_) {}
    try { await this.router.navigate(['/public/user/login'], { queryParams: { reason: 'session-expired' } }); } catch (_) {}
    // Allow re-entry once the user logs in again.
    setTimeout(() => { this._authExpiredHandled = false; }, 5000);
  }

  private _authRef: any = null;
  private formatReason(reason: string): string {
    try {
      // Lazy resolution to avoid circular dependency (AuthService ↔ ApiService)
      if (!this._authRef) {
        this._authRef = this.injector.get((require('./auth.service') as any).AuthService);
      }
      const user = this._authRef?.userInfo;
      if (user?.userId) {
        return `[userId:${user.userId}|${user.name || ''}] ${reason}`;
      }
    } catch (_) {}
    return reason;
  }

  apiURL = this.configService.get('apiURL');

  private async authHeader(): Promise<Record<string, string>> {
    const token = await this.sessionService.getActiveToken();
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  }

  private getAuditHeaders(): Record<string, string> {
    try {
      if (!this._authRef) {
        this._authRef = this.injector.get((require('./auth.service') as any).AuthService);
      }
      const user = this._authRef?.userInfo;
      if (user?.userId) {
        return {
          'X-Audit-User-Id': String(user.userId),
          'X-Audit-User-Name': user.name || '',
        };
      }
    } catch (_) {}
    return {};
  }

  // ─── Vault — Config (unauthenticated) ────────────────────────────────────────

  async vaultGetConfig(): Promise<{ rpcNode: string; entityContract: string; globalVariablesProxyContract: string; globalSalt: string; bootstrapSalt?: string } | null> {
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

  async vaultFeatures(): Promise<{ dex: boolean; menu: Record<string, boolean> } | null> {
    try {
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + '/vault/features',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.data?.type !== 'success') return null;
      const features = response.data.features ?? {};
      return { dex: !!features.dex, menu: response.data.menu ?? {} };
    } catch {
      return null;
    }
  }

  // Menu config (admin Menu Settings page) — JWT-gated under /vault/...
  async vaultMenuConfigList(): Promise<{ menuKey: string; enabled: boolean; updatedAt: number | null; updatedByUserId: string | null }[]> {
    const data = await this.vaultGet('/menu-config');
    return (data?.menu ?? []).map((r: any) => ({
      menuKey: r.menu_key,
      enabled: !!r.enabled,
      updatedAt: r.updated_at != null ? Number(r.updated_at) : null,
      updatedByUserId: r.updated_by_user_id ?? null,
    }));
  }

  async vaultMenuConfigSet(key: string, enabled: boolean) {
    return this.vaultPut('/menu-config/' + key, { enabled });
  }

  // ─── Vault helpers ────────────────────────────────────────────────────────────

  private async vaultGet(path: string, params?: Record<string, any>) {
    try {
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + '/vault' + path,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
        },
        params,
      });
      if (response.status === 401) { this._handleAuthFailure(); return null; }
      if (response.data?.type !== 'success') return null;
      return response.data;
    } catch {
      return null;
    }
  }

  private extractError(response: any): string {
    const d = response?.data;
    if (d && typeof d === 'object') {
      return d.error || d.message || d.reason || `HTTP ${response.status}`;
    }
    if (typeof d === 'string' && d) return d;
    return `HTTP ${response?.status ?? 'error'}`;
  }

  private async vaultPost(path: string, body: Record<string, any>) {
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/vault' + path,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
        data: body,
      });
      if (response.status === 401) { this._handleAuthFailure(); return { error: 'Session expired. Please log in again.' }; }
      if (response.data?.type !== 'success') return { error: this.extractError(response) };
      return response.data;
    } catch (e: any) {
      return { error: e?.message || 'Network error' };
    }
  }

  private async vaultPatch(path: string, body: Record<string, any>) {
    try {
      const response = await CapacitorHttp.request({
        method: 'PATCH',
        url: this.apiURL + '/vault' + path,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
        data: body,
      });
      if (response.status === 401) { this._handleAuthFailure(); return { error: 'Session expired. Please log in again.' }; }
      if (response.data?.type !== 'success') return { error: this.extractError(response) };
      return response.data;
    } catch (e: any) {
      return { error: e?.message || 'Network error' };
    }
  }

  private async vaultDelete(path: string) {
    try {
      const response = await CapacitorHttp.request({
        method: 'DELETE',
        url: this.apiURL + '/vault' + path,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
      });
      if (response.status === 401) { this._handleAuthFailure(); return { error: 'Session expired. Please log in again.' }; }
      if (response.data?.type !== 'success') return { error: this.extractError(response) };
      return response.data;
    } catch (e: any) {
      return { error: e?.message || 'Network error' };
    }
  }

  private async vaultPut(path: string, body: Record<string, any>) {
    try {
      const response = await CapacitorHttp.request({
        method: 'PUT',
        url: this.apiURL + '/vault' + path,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
        data: body,
      });
      if (response.status === 401) { this._handleAuthFailure(); return { error: 'Session expired. Please log in again.' }; }
      if (response.data?.type !== 'success') return { error: this.extractError(response) };
      return response.data;
    } catch (e: any) {
      return { error: e?.message || 'Network error' };
    }
  }

  // ─── Authenticated (non-vault) helpers ─────────────────────────────────────────

  private async authGet(path: string, params?: Record<string, any>) {
    try {
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + path,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
        params,
      });
      if (response.status === 401) { this._handleAuthFailure(); return null; }
      if (response.status >= 300 || response.data?.error) return null;
      return response.data;
    } catch {
      return null;
    }
  }

  private async authPost(path: string, body: Record<string, any>) {
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + path,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
        data: body,
      });
      if (response.status === 401) { this._handleAuthFailure(); return null; }
      if (response.status >= 300 || response.data?.error) return null;
      return response.data;
    } catch {
      return null;
    }
  }

  private async authPut(path: string, body: Record<string, any>) {
    try {
      const response = await CapacitorHttp.request({
        method: 'PUT',
        url: this.apiURL + path,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
        data: body,
      });
      if (response.status === 401) { this._handleAuthFailure(); return null; }
      if (response.status >= 300 || response.data?.error) return null;
      return response.data;
    } catch {
      return null;
    }
  }

  private async authDelete(path: string) {
    try {
      const response = await CapacitorHttp.request({
        method: 'DELETE',
        url: this.apiURL + path,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
      });
      if (response.status === 401) { this._handleAuthFailure(); return null; }
      if (response.status >= 300 || response.data?.error) return null;
      return response.data;
    } catch {
      return null;
    }
  }

  // ─── Vault — DEX ──────────────────────────────────────────────────────────────

  async vaultDexVenuesList(start = 1, offset = 50) {
    const data = await this.vaultGet('/dex/venues', { start, offset });
    return data ? { count: data.count, venues: data.venues } : null;
  }
  async vaultDexVenueInfo(address: string) {
    const data = await this.vaultGet('/dex/venues/' + address);
    return data?.venue ?? null;
  }
  async vaultDexVenueCreate(serviceAddress: string) {
    return this.vaultPost('/dex/venues', { serviceAddress });
  }
  async vaultDexVenueSetState(address: string, newState: number) {
    return this.vaultPut('/dex/venues/' + address + '/state', { newState });
  }
  async vaultDexAssetListingsList(start = 1, offset = 50) {
    const data = await this.vaultGet('/dex/asset-listings', { start, offset });
    return data ? { count: data.count, listings: data.listings } : null;
  }
  async vaultDexAssetListingInfo(asset: string) {
    const data = await this.vaultGet('/dex/asset-listings/' + asset);
    return data?.listing ?? null;
  }
  async vaultDexAssetListingCreate(baseAsset: string, venue: boolean, country: boolean, global: boolean) {
    return this.vaultPost('/dex/asset-listings', { baseAsset, venue, country, global });
  }

  // Per-listing issuer-enabled venues — flat list (one row per (asset, venue), tier as a column).
  async vaultDexAssetListingVenues(asset: string) {
    const data = await this.vaultGet(`/dex/asset-listings/${asset}/venues`);
    return data ? { count: data.count, venues: data.venues } : null;
  }
  async vaultDexAssetListingVenueAdd(asset: string, dexService: string, tier: number) {
    return this.vaultPost(`/dex/asset-listings/${asset}/venues`, { dexService, tier });
  }
  async vaultDexAssetListingVenueSetTier(asset: string, dexService: string, tier: number) {
    return this.vaultPatch(`/dex/asset-listings/${asset}/venues/${dexService}`, { tier });
  }
  async vaultDexAssetListingVenueRemove(asset: string, dexService: string) {
    return this.vaultDelete(`/dex/asset-listings/${asset}/venues/${dexService}`);
  }
  async vaultDexAssetListingVenuesAvailable(asset: string, tier: number, opts: { q?: string; country?: number } = {}) {
    const params: any = {};
    if (opts.q)       params.q       = opts.q;
    if (opts.country) params.country = opts.country;
    const data = await this.vaultGet(`/dex/asset-listings/${asset}/venues/${tier}/available`, params);
    return data ? { count: data.count, venues: data.venues } : null;
  }

  // Venue tier requests (entity-side)
  async vaultDexVenueRequestTier(address: string, tier: number) {
    return this.vaultPost(`/dex/venues/${address}/tier-request`, { tier });
  }

  async vaultDexVenueAssets(address: string, tier?: number) {
    const params: any = {};
    if (tier) params.tier = tier;
    const data = await this.vaultGet(`/dex/venues/${address}/assets`, params);
    return data ? { count: data.count, assets: data.assets } : null;
  }

  // DEX — Orders / Trades / Order Book (Phase B)
  async vaultDexOrdersList(filters: { status?: string | number; side?: string | number; asset?: string; venue?: string; subscription?: string; start?: number; offset?: number } = {}) {
    const params: any = { start: filters.start ?? 1, offset: filters.offset ?? 50 };
    if (filters.status      !== undefined && filters.status      !== '') params.status       = filters.status;
    if (filters.side        !== undefined && filters.side        !== '') params.side         = filters.side;
    if (filters.asset)        params.asset        = filters.asset;
    if (filters.venue)        params.dexService   = filters.venue;
    if (filters.subscription) params.subscription = filters.subscription;
    const data = await this.vaultGet('/dex/orders', params);
    return data ? { count: data.count, orders: data.orders } : null;
  }
  async vaultDexOrderInfo(orderId: number | string) {
    const data = await this.vaultGet('/dex/orders/' + orderId);
    return data?.order ?? null;
  }
  async vaultDexPlaceOrder(body: { subscription: string; dexService: string; baseAsset: string; side: number; marketScope: number; price: string; amount: string }) {
    return this.vaultPost('/dex/orders', body);
  }
  async vaultDexCancelOrder(orderId: number | string) {
    return this.vaultPut('/dex/orders/' + orderId + '/cancel', {});
  }
  async vaultDexMatchOrders(buyOrderId: number, sellOrderId: number) {
    return this.vaultPut('/dex/match', { buyOrderId, sellOrderId });
  }
  async vaultDexTradesList(filters: { asset?: string; venue?: string; party?: string; scope?: string | number; start?: number; offset?: number } = {}) {
    const params: any = { start: filters.start ?? 1, offset: filters.offset ?? 50 };
    if (filters.asset) params.asset      = filters.asset;
    if (filters.venue) params.dexService = filters.venue;
    if (filters.party) params.party      = filters.party;
    if (filters.scope !== undefined && filters.scope !== '') params.scope = filters.scope;
    const data = await this.vaultGet('/dex/trades', params);
    return data ? { count: data.count, trades: data.trades } : null;
  }
  async vaultDexTradeInfo(tradeId: number | string) {
    const data = await this.vaultGet('/dex/trades/' + tradeId);
    return data?.trade ?? null;
  }
  async vaultDexOrderBook(asset: string, params: { dexService?: string; countryCode?: number; currencyCode?: number; start?: number; offset?: number } = {}) {
    const q: any = { start: params.start ?? 1, offset: params.offset ?? 50 };
    if (params.dexService)   q.dexService   = params.dexService;
    if (params.countryCode)  q.countryCode  = params.countryCode;
    if (params.currencyCode) q.currencyCode = params.currencyCode;
    return this.vaultGet('/dex/order-book/' + asset, q);
  }


  // ─── Vault — Assets ───────────────────────────────────────────────────────────

  async vaultGetAssets(start = 0, offset = 50, service?: string) {
    const params: Record<string, any> = { start, offset };
    if (service) params['service'] = service;
    const data = await this.vaultGet('/assets', params);
    return data ? { count: data.count, assets: data.assets } : null;
  }

  async vaultCheckSymbol(currencyCode: number, symbol: string): Promise<boolean | null> {
    const data = await this.vaultGet('/assets/check-symbol', { currencyCode: String(currencyCode), symbol });
    return data?.exists ?? null;
  }

  async vaultGetAsset(address: string) {
    const data = await this.vaultGet('/assets/' + address);
    return data?.asset ?? null;
  }

  async vaultGetAssetPrice(address: string) {
    const data = await this.vaultGet('/assets/' + address + '/price');
    return data?.price ?? null;
  }

  async vaultSetAssetPrice(payload: { asset: string; bid: number; ask: number; timestamp: number }) {
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/assets/price',
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
        data: payload,
      });
      if (response.status === 401) { this._handleAuthFailure(); return { error: 'Session expired. Please log in again.' }; }
      if (response.data?.success !== true) return { error: this.extractError(response) };
      return response.data;
    } catch (e: any) {
      return { error: e?.message || 'Network error' };
    }
  }

  async vaultGetAssetFeeConfig(asset: string, service: string): Promise<{ feeConfig: FeeConfig | null } | null> {
    const data = await this.vaultGet('/assets/' + asset + '/services/' + service + '/fee-config');
    if (!data) return null;
    return { feeConfig: data.feeConfig ?? null };
  }

  async vaultSetAssetFeeConfig(asset: string, service: string, feeConfig: FeeConfig) {
    const data = await this.vaultPut('/assets/' + asset + '/services/' + service + '/fee-config', { feeConfig });
    return data ?? null;
  }

  async vaultQuoteAssetFee(asset: string, service: string, direction: number, gross: string | number) {
    const data = await this.vaultGet('/assets/' + asset + '/services/' + service + '/quote-fee', { direction, gross });
    return data ?? null;
  }

  // Venue-side fee config (Phase B, all-flows) — keyed by (service, asset) on the
  // distributing service's ServiceTemplate. Stacks with the asset-side cut on every
  // credit-settled flow through callExternalBatchWithCreditFee.
  async vaultGetServiceFeeConfig(service: string, asset: string): Promise<{ feeConfig: FeeConfig | null } | null> {
    const data = await this.vaultGet('/services/' + service + '/assets/' + asset + '/fee-config');
    if (!data) return null;
    return { feeConfig: data.feeConfig ?? null };
  }

  async vaultSetServiceFeeConfig(service: string, asset: string, feeConfig: FeeConfig) {
    const data = await this.vaultPut('/services/' + service + '/assets/' + asset + '/fee-config', { feeConfig });
    return data ?? null;
  }

  async vaultQuoteServiceFee(service: string, asset: string, direction: number, gross: string | number) {
    const data = await this.vaultGet('/services/' + service + '/assets/' + asset + '/quote-fee', { direction, gross });
    return data ?? null;
  }

  async vaultGetAssetPriceHistory(address: string, start = 0, offset = 50) {
    const data = await this.vaultGet('/assets/' + address + '/price/history', { start, offset });
    return data ? { count: data.count, history: data.history } : null;
  }

  async vaultGetAssetServices(address: string) {
    const data = await this.vaultGet('/assets/' + address + '/services');
    return data?.services ?? null;
  }

  async vaultGetAssetWithheldTotal(address: string) {
    return this.vaultGet('/assets/' + address + '/withheld-total');
  }
  async vaultGetServiceWithheldSummary(address: string) {
    return this.vaultGet('/services/' + address + '/withheld-summary');
  }
  async vaultGetAssetHolders(address: string, start = 0, offset = 500) {
    const data = await this.vaultGet('/assets/' + address + '/holders', { start, offset });
    return data ? { count: data.count, holders: data.holders } : null;
  }

  // ─── Distributions (BYO standard — Credit dividends + stock splits) ─────────────
  // Mounted under /assets/... (not /vault/...) so they go through authGet/authPost.

  async distributionsList(asset: string, start = 1, offset = 50) {
    return this.authGet('/assets/' + asset + '/distributions', { start, offset });
  }

  async distributionGet(asset: string, distributionId: number | string) {
    return this.authGet('/assets/' + asset + '/distributions/' + distributionId);
  }

  async distributionLegsList(asset: string, distributionId: number | string, start = 1, offset = 50) {
    return this.authGet('/assets/' + asset + '/distributions/' + distributionId + '/legs', { start, offset });
  }

  async distributionDeclare(asset: string, body: { distType: number; amount: string; recordBlock?: number; sweepResidual?: boolean }) {
    return this.authPost('/assets/' + asset + '/distributions', body);
  }

  async distributionExecute(asset: string, distributionId: number | string, holders?: string[]) {
    return this.authPost('/assets/' + asset + '/distributions/' + distributionId + '/execute', holders?.length ? { holders } : {});
  }

  async distributionLegRetry(asset: string, distributionId: number | string, holder: string) {
    return this.authPost('/assets/' + asset + '/distributions/' + distributionId + '/legs/' + holder + '/retry', {});
  }

  async distributionFinalize(asset: string, distributionId: number | string) {
    return this.authPost('/assets/' + asset + '/distributions/' + distributionId + '/finalize', {});
  }

  async assetHoldersAt(asset: string, blockNumber: number, start = 0, offset = 50) {
    return this.authGet('/assets/' + asset + '/holders-at', { blockNumber, start, offset });
  }

  async assetBalanceAt(asset: string, account: string, blockNumber: number) {
    return this.authGet('/assets/' + asset + '/balance-at', { account, blockNumber });
  }

  // Path B — register an issuer's pre-deployed BYO contract.
  async assetPreviewRegister(address: string) {
    return this.authGet('/assets/preview-register', { address });
  }

  async assetRegisterExisting(address: string) {
    return this.authPost('/assets/register-existing', { address });
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

  async transactionBuy(body: { asset: string; service: string; subscriber: string; tokens: number; price?: number; data?: any; timestamp?: number }): Promise<{ result?: any; error?: string }> {
    return this._postPlain('/transactions/buy', body);
  }

  async transactionSell(body: { asset: string; service: string; subscriber: string; tokens: number; price?: number; data?: any; timestamp?: number }): Promise<{ result?: any; error?: string }> {
    return this._postPlain('/transactions/sell', body);
  }

  private async _postPlain(path: string, body: Record<string, any>): Promise<{ result?: any; error?: string }> {
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + path,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
        data: body,
      });
      if (response.status === 401) { this._handleAuthFailure(); return { error: 'Session expired. Please log in again.' }; }
      if (response.status >= 400 || response.data?.error) {
        return { error: response.data?.error || ('HTTP ' + response.status) };
      }
      return { result: response.data?.result };
    } catch (e: any) {
      return { error: e?.message || 'Network error' };
    }
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

  async vaultGetServicesCoverage() {
    const data = await this.vaultGet('/services/coverage');
    return data?.services ?? [];
  }

  async vaultGetServiceLiquidity(address: string) {
    const data = await this.vaultGet('/services/' + address + '/liquidity');
    return data?.balances ?? [];
  }

  async vaultServiceLiquidityInject(address: string, body: { currencyCode: number; amount: number; trxData?: string; refNo?: string }) {
    return this.vaultPost('/services/' + address + '/liquidity/inject', body);
  }

  async vaultServiceLiquidityWithdraw(address: string, body: { currencyCode: number; amount: number; trxData?: string; refNo?: string }) {
    return this.vaultPost('/services/' + address + '/liquidity/withdraw', body);
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

  // Regulator-hold mirror — read-only. Hold create / release happens regulator-side; this
  // is the entity's view of any freeze placed on a subscription's holdings of an asset.
  async vaultGetSubscriptionRegulatorHolds(subscription: string, asset: string, start = 1, offset = 50) {
    return this.vaultGet(`/subscriptions/${subscription}/holdings/${asset}/regulator-holds`, { start, offset });
  }
  async vaultGetAssetRegulatorHold(asset: string, holdId: number) {
    return this.vaultGet(`/assets/${asset}/regulator-holds/${holdId}`);
  }

  // ─── Vault — State Change Logs ──────────────────────────────────────────────

  async vaultGetStateChangeLogs(address: string, start = 1, offset = 50) {
    return this.vaultGet(`/state-logs/${address}?start=${start}&offset=${offset}`);
  }
  async vaultGetAllStateChangeLogs(start = 1, offset = 50, type?: string) {
    let url = `/state-logs?start=${start}&offset=${offset}`;
    if (type) url += `&type=${type}`;
    return this.vaultGet(url);
  }

  // ─── Vault — Dashboard ───────────────────────────────────────────────────────

  async vaultGetDashboardSummary() {
    const data = await this.vaultGet('/dashboard/summary');
    return data ?? null;
  }

  async vaultGetDashboardActivity(interval: string, points = 30) {
    const data = await this.vaultGet(`/dashboard/activity?interval=${encodeURIComponent(interval)}&points=${points}`);
    return data ?? null;
  }

  // ─── Vault — Analytics ───────────────────────────────────────────────────────

  async vaultGetAumTrend(interval = '1d', points = 30) {
    const data = await this.vaultGet(`/analytics/aum-trend?interval=${encodeURIComponent(interval)}&points=${points}`);
    return data ?? null;
  }

  async vaultGetHolderConcentration() {
    const data = await this.vaultGet('/analytics/holder-concentration');
    return data ?? null;
  }

  async vaultGetNetFlow(interval = '1d', points = 30) {
    const data = await this.vaultGet(`/analytics/net-flow?interval=${encodeURIComponent(interval)}&points=${points}`);
    return data ?? null;
  }

  async vaultGetCreditExposure() {
    const data = await this.vaultGet('/analytics/credit-exposure');
    return data ?? null;
  }

  async vaultGetDexVolume(interval = '1d', points = 30) {
    const data = await this.vaultGet(`/analytics/dex-volume?interval=${encodeURIComponent(interval)}&points=${points}`);
    return data ?? null;
  }

  async vaultGetValidatorReliance() {
    const data = await this.vaultGet('/analytics/validator-reliance');
    return data ?? null;
  }

  // ─── Vault — Sync ─────────────────────────────────────────────────────────────

  async vaultGetSyncStatus() {
    const data = await this.vaultGet('/sync/status');
    return data?.status ?? data ?? null;
  }

  async vaultSyncStatus() {
    return this.vaultGet('/sync/status');
  }

  async vaultSyncResync(fromBlock: number, mode: string) {
    return this.vaultPost('/sync/resync', { fromBlock, mode });
  }

  // ─── Vault — Asset writes ─────────────────────────────────────────────────────

  async vaultCreateAsset(body: Record<string, any>): Promise<{ type: string; error?: string; address?: string } | null> {
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/vault/assets',
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
        },
        data: body,
      });
      return response.data ?? null;
    } catch {
      return null;
    }
  }

  async vaultUpdateAssetState(address: string, state: number, reason = '') {
    const data = await this.vaultPut('/assets/' + address + '/state', { state, reason: this.formatReason(reason) });
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

  async vaultSetAssetServiceState(assetAddress: string, serviceAddress: string, state: number, reason = '') {
    const data = await this.vaultPut('/assets/' + assetAddress + '/services/' + serviceAddress + '/state', { state, reason: this.formatReason(reason) });
    return data ?? null;
  }

  async vaultSetAssetServiceCanQuote(assetAddress: string, serviceAddress: string, allowed: boolean) {
    const data = await this.vaultPut('/assets/' + assetAddress + '/services/' + serviceAddress + '/can-quote', { allowed });
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

  async vaultUpdateServiceState(address: string, state: number, reason = '') {
    const data = await this.vaultPut('/services/' + address + '/state', { state, reason: this.formatReason(reason) });
    return data ?? null;
  }

  async vaultSetServiceVisibility(address: string, visibility: number) {
    const data = await this.vaultPut('/services/' + address + '/visibility', { visibility });
    return data ?? null;
  }

  async vaultSetServiceValidator(address: string, validator: string) {
    const data = await this.vaultPut('/services/' + address + '/validator', { validator });
    return data ?? null;
  }

  async vaultSetServicePaymentProcessor(address: string, paymentProcessor: string) {
    const data = await this.vaultPut('/services/' + address + '/payment-processor', { payment_processor: paymentProcessor });
    return data ?? null;
  }

  async vaultSetServiceCustodian(address: string, custodian: string) {
    const data = await this.vaultPut('/services/' + address + '/custodian', { custodian });
    return data ?? null;
  }

  // ─── Vault — Validators & Payment Processors ─────────────────────────────────

  async vaultGetValidators(start = 1, offset = 50) {
    const data = await this.vaultGet('/validators', { start, offset });
    return data ? { count: data.count, validators: data.validators } : null;
  }

  async vaultGetPaymentProcessors(start = 1, offset = 50) {
    const data = await this.vaultGet('/payment-processors', { start, offset });
    return data ? { count: data.count, paymentProcessors: data.paymentProcessors } : null;
  }

  // `regulatorAddress` is accepted for call-site compatibility but no longer sent — the Entity API's
  // /vault/custodians derives the entity's own regulator server-side and merges owned + endorsed,
  // mirroring /validators and /payment-processors. (The old /regulators/:addr/custodians/endorsed
  // route never existed, so the picker always came back empty.)
  async vaultGetEndorsedCustodians(_regulatorAddress: string, start = 1, offset = 50) {
    const data = await this.vaultGet('/custodians', { start, offset });
    return data ? { count: data.count, custodians: data.custodians } : null;
  }

  // ─── Vault — Entity-curated service providers ────────────────────────────────

  // type: 1=Validator, 2=PaymentProcessor, 3=Custodian (optional). state: 'active' | 1 | 2 (optional).
  async vaultGetServiceProviders(type?: number, state?: number | string) {
    const params: Record<string, any> = {};
    if (type !== undefined && type !== null) params['type'] = type;
    if (state !== undefined && state !== null) params['state'] = state;
    const data = await this.vaultGet('/service-providers', params);
    return data ? { count: data.count, providers: data.providers } : null;
  }

  async vaultGetServiceProviderUsage(address: string) {
    const data = await this.vaultGet('/service-providers/' + address + '/usage');
    return data ? { inUse: data.inUse, count: data.count, services: data.services } : null;
  }

  // Read-only: currencies the regulator has approved this entity to operate in.
  // Pass state='active' to get only currently-approved (non-suspended) currencies.
  async vaultGetApprovedCurrencies(state?: number | string) {
    const params: Record<string, any> = {};
    if (state !== undefined && state !== null) params['state'] = state;
    const data = await this.vaultGet('/approved-currencies', params);
    return data ? { count: data.count, currencies: data.currencies } : null;
  }

  async vaultAddServiceProvider(provider: string, spType: number) {
    const data = await this.vaultPost('/service-providers', { provider, sp_type: spType });
    return data ?? null;
  }

  async vaultSetServiceProviderState(address: string, state: number) {
    const data = await this.vaultPut('/service-providers/' + address + '/state', { state });
    return data ?? null;
  }

  // ─── Vault — Subscription writes ─────────────────────────────────────────────

  async vaultUpdateSubscriptionState(address: string, state: number, reason = '') {
    const data = await this.vaultPut('/subscriptions/' + address + '/state', { state, reason: this.formatReason(reason) });
    return data ?? null;
  }

  async vaultGetSubscriptionCreditBalance(address: string) {
    const data = await this.vaultGet('/subscriptions/' + address + '/credit-balance');
    return data?.balances ?? null;
  }

  async vaultGetSubscriptionCreditTransactions(address: string, start = 1, offset = 50) {
    const data = await this.vaultGet('/subscriptions/' + address + '/credit-transactions', { start: String(start), offset: String(offset) });
    return data ? { count: data.count, transactions: data.transactions } : null;
  }

  async vaultGetEntityCreditOverview() {
    const data = await this.vaultGet('/entity/credit-overview');
    return data ? { totals: data.totals, subscriptions: data.subscriptions } : null;
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

  async vaultGetUserDefaultKey(id: string | number) {
    const data = await this.vaultGet('/users/' + id + '/default-key');
    return data ? { address: data.address as string | null, keyId: data.keyId as number | null } : null;
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

  async creditDeposit(body: { service: string; paymentProcessor: string; subscriber: string; currencyCode: number; amount: number; data?: any }): Promise<{ result?: any; error?: string }> {
    return this._creditMutation('/credit/deposit', body);
  }

  async creditWithdraw(body: { service: string; paymentProcessor: string; subscriber: string; currencyCode: number; amount: number; data?: any }): Promise<{ result?: any; error?: string }> {
    return this._creditMutation('/credit/withdraw', body);
  }

  // Bank hub move — the entity's Bank-level PP `service` moves an identity's credit between its
  // bank-account hub and a spoke subscription (both same identity, enforced on-chain).
  async bankTransfer(body: { service: string; from: string; to: string; currencyCode: number; amount: number; data?: any; refNo?: string }): Promise<{ result?: any; requestId?: string; approvalState?: number; error?: string }> {
    return this._creditMutation('/credit/bank-transfer', body);
  }

  // Anonymous service-routed move — the entity's source `service` routes `fromSub`'s credit to the
  // SAME identity's subscription at `destinationService` (resolved on-chain; the sibling sub + DID are never exposed).
  async routeTransfer(body: { service: string; fromSub: string; destinationService: string; currencyCode: number; amount: number; data?: any; refNo?: string }): Promise<{ result?: any; requestId?: string; approvalState?: number; error?: string }> {
    return this._creditMutation('/credit/route-transfer', body);
  }

  private async _creditMutation(path: string, body: Record<string, any>): Promise<{ result?: any; requestId?: string; approvalState?: number; error?: string }> {
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + path,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
        data: body,
      });
      if (response.status === 401) { this._handleAuthFailure(); return { error: 'Session expired. Please log in again.' }; }
      if (response.status >= 400 || response.data?.error) {
        return { error: response.data?.error || ('HTTP ' + response.status) };
      }
      // Maker/checker: when policy is on, the API returns { requestId, approvalState } instead of executing.
      return { result: response.data?.result, requestId: response.data?.requestId, approvalState: response.data?.approvalState };
    } catch (e: any) {
      return { error: e?.message || 'Network error' };
    }
  }

  async vaultGetApprovedPaymentProcessors(): Promise<Array<{ service: string; name: string; regulator: string; serviceLevel: number }> | null> {
    try {
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + '/credit/approved-processors',
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
        },
      });
      if (response.data?.type !== 'success') return null;
      return response.data.processors;
    } catch {
      return null;
    }
  }

  async usersOnboard(body: Record<string, any>): Promise<{ subscriptionAddress?: string; error?: string }> {
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/users/onboard',
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
        data: body,
      });
      if (response.status === 401) { this._handleAuthFailure(); return { error: 'Session expired. Please log in again.' }; }
      if (response.status >= 400 || response.data?.error) {
        return { error: response.data?.error || ('HTTP ' + response.status) };
      }
      return { subscriptionAddress: response.data?.subscriptionAddress };
    } catch (e: any) {
      return { error: e?.message || 'Network error' };
    }
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

  async vaultDirectoryByAddress(address: string) {
    const data = await this.vaultGet('/directory/by-address/' + address);
    return data?.entry ?? null;
  }

  // ─── Vault — Entity auth ──────────────────────────────────────────────────────

  async entityLogin(username: string, password: string, sessionDuration: number, saltOverride?: string, passwordIsRawBigInt: boolean = false) {
    // Fetch the user's { nonce, commitment } from the API so proof generation never reads the RPC
    // node directly — login routes entirely through the Entity API.
    const loginHash   = await this.ethersService.computeLoginHash(username);
    const credentials = await this.vaultUserCredentialsData(loginHash);
    if (!credentials) return { success: false, error: 'Failed to fetch user credentials' };
    const payload = await this.ethersService.createLoginPayload(username, password, sessionDuration, saltOverride, passwordIsRawBigInt, credentials);
    if (!payload) return { success: false, error: 'Proof generation failed' };
    const { key, ...rest } = payload;
    // Raw POST so we can surface the contract-level revert reason (nonce mismatch,
    // commitment mismatch, invalid zk proof, …). PUBLIC endpoint — no Authorization
    // header (the user has no JWT yet).
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/vault/entity/login',
        headers: { 'Content-Type': 'application/json' },
        data: { ...rest, privateKey: key.privateKey },
      });
      if (response.data?.type === 'success') {
        return {
          success: true,
          userId: response.data.userId,
          token: response.data.token,
          expiresAt: response.data.expiresAt,
          refreshExpiresAt: response.data.refreshExpiresAt,
          key,
        };
      }
      return { success: false, error: response.data?.error || 'Login API call failed', key };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Login API call failed', key };
    }
  }

  async entityLogout() {
    const data = await this.vaultPost('/entity/logout', {});
    return data ?? null;
  }

  // Bootstrap-admin claim flow ────────────────────────────────────────────────
  // Probe whether a loginHash points at an unclaimed bootstrap admin. PUBLIC endpoint —
  // safe to call before any session exists.
  async vaultUserClaimStatus(loginHash: string) {
    try {
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + '/vault/users/claim-status?loginHash=' + encodeURIComponent(loginHash),
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.data?.type === 'success') return response.data.status;
      return null;
    } catch { return null; }
  }

  // Fetch a user's { nonce, commitment } by loginHash so the ZK login circuit input can be built
  // without a direct RPC read. PUBLIC endpoint — called pre-login (no JWT yet), same as claim-status.
  async vaultUserCredentialsData(loginHash: string): Promise<{ nonce: string; commitment: string } | null> {
    try {
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + '/vault/users/credentials-data?loginHash=' + encodeURIComponent(loginHash),
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.data?.type === 'success') return response.data.credentials;
      return null;
    } catch { return null; }
  }

  // Submit the claim transaction. Must be called immediately after a successful login with the
  // placeholder commitment — the just-established admin session is what authenticates the call
  // on chain (contract enforces authorizedUser[msg.sender] == 1).
  async vaultUserAdminClaim(newCommitment: string, profile?: { name: string; username: string; email: string }) {
    const data = await this.vaultPost('/users/admin-claim', { newCommitment, ...(profile || {}) });
    return data ?? null;
  }

  // Best-effort claim of the entity's own DID. Called by the bootstrap-admin claim wizard right
  // after vaultUserAdminClaim succeeds. Payload carries a fresh ZK login proof for the
  // IdentityTemplate (using the same OTP as the bootstrap login) plus the new commitment.
  // Returns `{ skipped: true }` when the entity has no DID linked.
  async vaultIdentityAdminClaim(payload: {
    identityAddress: string;
    privateKey: string;
    a: string[];
    b: string[][];
    c: string[];
    proofInput: string[];
    signedMessage: string;
    sessionDuration: number;
    newCommitment: string;
  }) {
    const data = await this.vaultPost('/identity/admin-claim', payload);
    return data ?? null;
  }

  // Fetch the entity DID's { nonce, commitment } so the claim wizard can build the DID login
  // circuit input without a direct RPC read. PUBLIC endpoint — called pre-session in the wizard.
  async vaultIdentityCredentialsData(identityAddress: string): Promise<{ nonce: string; commitment: string } | null> {
    try {
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + '/vault/identity/credentials-data?identityAddress=' + encodeURIComponent(identityAddress),
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.data?.type === 'success') return response.data.credentials;
      return null;
    } catch { return null; }
  }

  async vaultGetEntityInfo() {
    const data = await this.vaultGet('/entity/info');
    return data?.entity ?? null;
  }

  async vaultUpdateEntityMetadata(metadata: Record<string, any>) {
    const data = await this.vaultPut('/entity/metadata', { metadata });
    return data ?? null;
  }

  async vaultUpdateAssetMetadata(address: string, metadata: Record<string, any>) {
    const data = await this.vaultPut('/assets/' + address + '/metadata', { metadata });
    return data ?? null;
  }

  async vaultUpdateServiceMetadata(address: string, metadata: Record<string, any>) {
    const data = await this.vaultPut('/services/' + address + '/metadata', { metadata });
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

  // ─── Signer Keys ──────────────────────────────────────────────────────────────

  async signerKeyGenerate(description?: string) {
    return await this.authPost('/signer-keys/generate', { description: description || '' });
  }

  async signerKeyList(start = 1, offset = 50) {
    return await this.authGet('/signer-keys', { start: String(start), offset: String(offset) });
  }

  async signerKeyGet(id: string) {
    return await this.authGet('/signer-keys/' + id);
  }

  async signerKeyUpdate(id: string, description: string) {
    return await this.authPut('/signer-keys/' + id, { description });
  }

  async signerKeyChangeState(id: string, state: number) {
    return await this.authPut('/signer-keys/' + id + '/state', { state });
  }

  async signerKeyRemove(id: string) {
    return await this.authDelete('/signer-keys/' + id);
  }

  // ─── Documents (this entity's own RegulatorTemplate-style documents) ──────────

  async documentsList(start = 1, offset = 50) {
    return await this.authGet('/documents', { start: String(start), offset: String(offset) });
  }
  async documentsSharedWithMe(start = 1, offset = 50) {
    return await this.authGet('/documents/shared-with-me', { start: String(start), offset: String(offset) });
  }
  async documentGet(id: any)                             { return await this.authGet('/documents/' + id); }
  async documentAdd(body: any)                           { return await this.authPost('/documents', body); }
  async documentUpdate(id: any, body: any)               { return await this.authPut('/documents/' + id, body); }
  async documentRemove(id: any)                          { return await this.authDelete('/documents/' + id); }
  async documentSetState(id: any, newState: number)     { return await this.authPut('/documents/' + id + '/state', { newState }); }
  async documentShare(id: any, account: string)         { return await this.authPost('/documents/' + id + '/share', { account }); }
  async documentUnshare(id: any, account: string)       { return await this.authDelete('/documents/' + id + '/share/' + account); }
  async documentGetSharedWith(id: any)                   { return await this.authGet('/documents/' + id + '/shared'); }
  async documentPublish(id: any)                         { return await this.authPost('/documents/' + id + '/publish', {}); }

  // Shared multipart uploader. Path-agnostic so the same code serves entity / service / asset /
  // subscription document POSTs. The API handles encryption, IPFS pin, wrapped-DEK assembly, and
  // on-chain addDocument — frontend just posts raw file + metadata.
  // Returns the parsed JSON on 2xx, or { error, status } on any failure path
  // (HTTP error, network error, abort, parse failure). Callers should check
  // `result?.error` rather than just `!result`. On 401, the global auth-failure
  // handler is invoked so the user is bounced to /public/user/login instead of
  // staring at a generic toast.
  private async _uploadMultipart(
    path: string,
    file: File,
    metadata: { title?: string; description?: string; fileType?: string; documentType: number; documentState: number; sharedWith?: string[] },
    onProgress?: (percent: number) => void
  ): Promise<any> {
    const token = await this.sessionService.getActiveToken();
    if (!token) {
      this._handleAuthFailure();
      return { error: 'Session expired. Please log in again.', status: 401 };
    }
    return new Promise<any>((resolve) => {
      try {
        const form = new FormData();
        form.append('file', file, file.name);
        if (metadata.title)       form.append('title', metadata.title);
        if (metadata.description) form.append('description', metadata.description);
        if (metadata.fileType)    form.append('fileType', metadata.fileType);
        form.append('documentType', String(metadata.documentType));
        form.append('documentState', String(metadata.documentState));
        if (metadata.sharedWith && metadata.sharedWith.length) {
          form.append('sharedWith', JSON.stringify(metadata.sharedWith));
        }

        const xhr = new XMLHttpRequest();
        xhr.open('POST', this.apiURL + path);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        const audit = this.getAuditHeaders();
        for (const [k, v] of Object.entries(audit)) xhr.setRequestHeader(k, v);

        xhr.upload.onprogress = (e) => {
          if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          let json: any = null;
          try { json = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* non-JSON body */ }
          if (xhr.status === 401) {
            this._handleAuthFailure();
            resolve({ error: 'Session expired. Please log in again.', status: 401 });
            return;
          }
          if (xhr.status >= 300 || json?.error) {
            const msg = json?.error || json?.message || `Upload failed (HTTP ${xhr.status})`;
            resolve({ error: msg, status: xhr.status });
            return;
          }
          resolve(json ?? { ok: true });
        };
        xhr.onerror = () => resolve({ error: 'Network error', status: 0 });
        xhr.onabort = () => resolve({ error: 'Upload aborted', status: 0 });
        xhr.send(form);
      } catch (e: any) {
        resolve({ error: e?.message || 'Upload failed', status: 0 });
      }
    });
  }

  // Shared file-streaming fetcher. Uses fetch() because CapacitorHttp coerces bodies to JSON on
  // ok responses. Caller owns URL.revokeObjectURL for the returned blobUrl.
  private async _fetchFileBlob(path: string): Promise<{ blobUrl: string; contentType: string } | null> {
    try {
      const res = await fetch(this.apiURL + path, {
        headers: {
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      return { blobUrl, contentType: blob.type || 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  // Entity-document shortcuts
  async documentAddMultipart(
    file: File,
    metadata: { title?: string; description?: string; fileType?: string; documentType: number; documentState: number; sharedWith?: string[] },
    onProgress?: (percent: number) => void,
  ) {
    return this._uploadMultipart('/documents', file, metadata, onProgress);
  }
  async documentFetchFile(id: any) {
    return this._fetchFileBlob('/documents/' + id + '/file');
  }
  // Cross-tenant inbound share: doc owned by another tenant (owner) and shared with this entity.
  async documentFetchSharedFile(owner: string, id: any) {
    return this._fetchFileBlob('/documents/shared/' + owner + '/' + id + '/file');
  }
  async documentSharedGet(owner: string, id: any) {
    return await this.authGet('/documents/shared/' + owner + '/' + id);
  }

  // Inbound shares to one of this tenant's NON-entity templates (a service / subscription / asset).
  // The API reads the doc AS that template (double-hop) since the entity isn't in its ACL.
  async inboundDocumentsList(template: string) {
    return await this.authGet('/documents/inbound/' + template);
  }
  async inboundDocumentFetchFile(template: string, owner: string, id: any) {
    return this._fetchFileBlob('/documents/inbound/' + template + '/' + owner + '/' + id + '/file');
  }

  // Document signatures (this entity's own documents)
  async documentSignatures(id: any, start = 1, offset = 50) {
    return await this.authGet('/documents/' + id + '/signatures', { start: String(start), offset: String(offset) });
  }
  async documentSigners(id: any)                         { return await this.authGet('/documents/' + id + '/signers'); }
  async documentHasSigned(id: any, account: string)     { return await this.authGet('/documents/' + id + '/signed/' + account); }
  async documentSignatureCount(id: any)                 { return await this.authGet('/documents/' + id + '/signatures/count'); }
  async documentSign(id: any, keyId: any, docHash: string) {
    return await this.authPost('/documents/' + id + '/sign', { keyId, docHash });
  }

  // ─── Service documents (scoped to a given service address) ───────────────────

  async serviceDocumentsList(address: string, start = 1, offset = 50) {
    return await this.authGet('/services/' + address + '/documents', { start: String(start), offset: String(offset) });
  }
  async serviceDocumentGet(address: string, id: any)                           { return await this.authGet('/services/' + address + '/documents/' + id); }
  async serviceDocumentAdd(address: string, body: any)                         { return await this.authPost('/services/' + address + '/documents', body); }
  async serviceDocumentUpdate(address: string, id: any, body: any)             { return await this.authPut('/services/' + address + '/documents/' + id, body); }
  async serviceDocumentRemove(address: string, id: any)                        { return await this.authDelete('/services/' + address + '/documents/' + id); }
  async serviceDocumentSetState(address: string, id: any, state: number)       { return await this.authPut('/services/' + address + '/documents/' + id + '/state', { state }); }
  async serviceDocumentShare(address: string, id: any, account: string)        { return await this.authPost('/services/' + address + '/documents/' + id + '/share', { account }); }
  async serviceDocumentUnshare(address: string, id: any, account: string)      { return await this.authDelete('/services/' + address + '/documents/' + id + '/share/' + account); }
  async serviceDocumentGetSharedWith(address: string, id: any)                 { return await this.authGet('/services/' + address + '/documents/' + id + '/shared'); }
  async serviceDocumentSignatures(address: string, id: any, start = 1, offset = 100) {
    return await this.authGet('/services/' + address + '/documents/' + id + '/signatures', { start: String(start), offset: String(offset) });
  }
  async serviceDocumentSigners(address: string, id: any)                       { return await this.authGet('/services/' + address + '/documents/' + id + '/signers'); }
  async serviceDocumentHasSigned(address: string, id: any, account: string)    { return await this.authGet('/services/' + address + '/documents/' + id + '/signed/' + account); }
  async serviceDocumentSignatureCount(address: string, id: any)                { return await this.authGet('/services/' + address + '/documents/' + id + '/signatures/count'); }
  async serviceDocumentSign(address: string, id: any, keyId: any, docHash: string) {
    return await this.authPost('/services/' + address + '/documents/' + id + '/sign', { keyId, docHash });
  }
  async serviceDocumentAddMultipart(
    address: string, file: File,
    metadata: { title?: string; description?: string; fileType?: string; documentType: number; documentState: number; sharedWith?: string[] },
    onProgress?: (percent: number) => void,
  ) {
    return this._uploadMultipart('/services/' + address + '/documents', file, metadata, onProgress);
  }
  async serviceDocumentFetchFile(address: string, id: any) {
    return this._fetchFileBlob('/services/' + address + '/documents/' + id + '/file');
  }
  async serviceDocumentPublish(address: string, id: any) {
    return await this.authPost('/services/' + address + '/documents/' + id + '/publish', {});
  }

  // ─── Asset documents (scoped to a given asset address) ───────────────────────

  async assetDocumentsList(address: string, start = 1, offset = 50) {
    return await this.authGet('/assets/' + address + '/documents', { start: String(start), offset: String(offset) });
  }
  async assetDocumentGet(address: string, id: any)                           { return await this.authGet('/assets/' + address + '/documents/' + id); }
  async assetDocumentAdd(address: string, body: any)                         { return await this.authPost('/assets/' + address + '/documents', body); }
  async assetDocumentUpdate(address: string, id: any, body: any)             { return await this.authPut('/assets/' + address + '/documents/' + id, body); }
  async assetDocumentRemove(address: string, id: any)                        { return await this.authDelete('/assets/' + address + '/documents/' + id); }
  async assetDocumentSetState(address: string, id: any, state: number)       { return await this.authPut('/assets/' + address + '/documents/' + id + '/state', { state }); }
  async assetDocumentShare(address: string, id: any, account: string)        { return await this.authPost('/assets/' + address + '/documents/' + id + '/share', { account }); }
  async assetDocumentUnshare(address: string, id: any, account: string)      { return await this.authDelete('/assets/' + address + '/documents/' + id + '/share/' + account); }
  async assetDocumentGetSharedWith(address: string, id: any)                 { return await this.authGet('/assets/' + address + '/documents/' + id + '/shared'); }
  async assetDocumentSignatures(address: string, id: any, start = 1, offset = 100) {
    return await this.authGet('/assets/' + address + '/documents/' + id + '/signatures', { start: String(start), offset: String(offset) });
  }
  async assetDocumentSigners(address: string, id: any)                       { return await this.authGet('/assets/' + address + '/documents/' + id + '/signers'); }
  async assetDocumentHasSigned(address: string, id: any, account: string)    { return await this.authGet('/assets/' + address + '/documents/' + id + '/signed/' + account); }
  async assetDocumentSignatureCount(address: string, id: any)                { return await this.authGet('/assets/' + address + '/documents/' + id + '/signatures/count'); }
  async assetDocumentSign(address: string, id: any, keyId: any, docHash: string) {
    return await this.authPost('/assets/' + address + '/documents/' + id + '/sign', { keyId, docHash });
  }
  async assetDocumentAddMultipart(
    address: string, file: File,
    metadata: { title?: string; description?: string; fileType?: string; documentType: number; documentState: number; sharedWith?: string[] },
    onProgress?: (percent: number) => void,
  ) {
    return this._uploadMultipart('/assets/' + address + '/documents', file, metadata, onProgress);
  }
  async assetDocumentFetchFile(address: string, id: any) {
    return this._fetchFileBlob('/assets/' + address + '/documents/' + id + '/file');
  }
  async assetDocumentPublish(address: string, id: any) {
    return await this.authPost('/assets/' + address + '/documents/' + id + '/publish', {});
  }

  // ─── Subscription documents ──────────────────────────────────────────────────

  async subscriptionDocumentsList(address: string, start = 1, offset = 50) {
    return await this.authGet('/subscriptions/' + address + '/documents', { start: String(start), offset: String(offset) });
  }
  async subscriptionDocumentGet(address: string, id: any)                           { return await this.authGet('/subscriptions/' + address + '/documents/' + id); }
  async subscriptionDocumentAdd(address: string, body: any)                         { return await this.authPost('/subscriptions/' + address + '/documents', body); }
  async subscriptionDocumentUpdate(address: string, id: any, body: any)             { return await this.authPut('/subscriptions/' + address + '/documents/' + id, body); }
  async subscriptionDocumentRemove(address: string, id: any)                        { return await this.authDelete('/subscriptions/' + address + '/documents/' + id); }
  async subscriptionDocumentSetState(address: string, id: any, state: number)       { return await this.authPut('/subscriptions/' + address + '/documents/' + id + '/state', { state }); }
  async subscriptionDocumentShare(address: string, id: any, account: string)        { return await this.authPost('/subscriptions/' + address + '/documents/' + id + '/share', { account }); }
  async subscriptionDocumentUnshare(address: string, id: any, account: string)      { return await this.authDelete('/subscriptions/' + address + '/documents/' + id + '/share/' + account); }
  async subscriptionDocumentGetSharedWith(address: string, id: any)                 { return await this.authGet('/subscriptions/' + address + '/documents/' + id + '/shared'); }
  async subscriptionDocumentSignatures(address: string, id: any, start = 1, offset = 100) {
    return await this.authGet('/subscriptions/' + address + '/documents/' + id + '/signatures', { start: String(start), offset: String(offset) });
  }
  async subscriptionDocumentSigners(address: string, id: any)                       { return await this.authGet('/subscriptions/' + address + '/documents/' + id + '/signers'); }
  async subscriptionDocumentHasSigned(address: string, id: any, account: string)    { return await this.authGet('/subscriptions/' + address + '/documents/' + id + '/signed/' + account); }
  async subscriptionDocumentSignatureCount(address: string, id: any)                { return await this.authGet('/subscriptions/' + address + '/documents/' + id + '/signatures/count'); }
  async subscriptionDocumentAddMultipart(
    address: string, file: File,
    metadata: { title?: string; description?: string; fileType?: string; documentType: number; documentState: number; sharedWith?: string[] },
    onProgress?: (percent: number) => void,
  ) {
    return this._uploadMultipart('/subscriptions/' + address + '/documents', file, metadata, onProgress);
  }
  async subscriptionDocumentFetchFile(address: string, id: any) {
    return this._fetchFileBlob('/subscriptions/' + address + '/documents/' + id + '/file');
  }
  async subscriptionDocumentPublish(address: string, id: any) {
    return await this.authPost('/subscriptions/' + address + '/documents/' + id + '/publish', {});
  }

  // ─── Subscription signer keys + signing relays ───────────────────────────────

  async subscriptionSignerKeyList(address: string, start = 1, offset = 100) {
    return await this.authGet('/subscriptions/' + address + '/signer-keys', { start: String(start), offset: String(offset) });
  }
  async subscriptionSignerKeyGet(address: string, keyId: any)                              { return await this.authGet('/subscriptions/' + address + '/signer-keys/' + keyId); }
  async subscriptionSignerKeyGenerate(address: string, description: string)                { return await this.authPost('/subscriptions/' + address + '/signer-keys/generate', { description }); }
  async subscriptionSignerKeyUpdate(address: string, keyId: any, description: string)      { return await this.authPut('/subscriptions/' + address + '/signer-keys/' + keyId, { description }); }
  async subscriptionSignerKeyChangeState(address: string, keyId: any, state: number)       { return await this.authPut('/subscriptions/' + address + '/signer-keys/' + keyId + '/state', { state }); }
  async subscriptionSignerKeyRemove(address: string, keyId: any)                           { return await this.authDelete('/subscriptions/' + address + '/signer-keys/' + keyId); }

  async subscriptionDocumentSign(address: string, id: any, keyId: any, docHash: string) {
    return await this.authPost('/subscriptions/' + address + '/documents/' + id + '/sign', { keyId, docHash });
  }
  async subscriptionForwardSignature(address: string, id: any, body: { targetType: 'entity' | 'service' | 'regulator', target?: string, keyId: any, docHash: string }) {
    return await this.authPost('/subscriptions/' + address + '/documents/' + id + '/forward-signature', body);
  }

  // ─── IPFS ─────────────────────────────────────────────────────────────────────

  async ipfsHealth()                                    { return await this.authGet('/ipfs/health'); }
  async ipfsFetchData(cid: string)                      { return await this.authGet('/ipfs/data/' + cid); }
  async ipfsFetchImage(cid: string)                     { return await this.authGet('/ipfs/image/' + cid); }
  async ipfsFetchFile(cid: string)                      { return await this.authGet('/ipfs/file/' + cid); }

  async ipfsUploadFile(file: File, onProgress?: (percent: number) => void): Promise<string | null> {
    const token = await this.sessionService.getActiveToken();
    return new Promise<string | null>((resolve) => {
      try {
        const form = new FormData();
        form.append('file', file, file.name);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', this.apiURL + '/ipfs/upload');
        if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);

        xhr.upload.onprogress = (e) => {
          if (onProgress && e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText);
            resolve(json?.cid || null);
          } catch { resolve(null); }
        };
        xhr.onerror = () => resolve(null);
        xhr.onabort = () => resolve(null);
        xhr.send(form);
      } catch { resolve(null); }
    });
  }

  // ─── Regulator Document Submissions ───────────────────────────────────────────

  async regulatorDocumentSign(documentId: string, regulatorAddress: string, keyId: string, docHash: string, title = '') {
    return await this.authPost('/regulator/documents/' + documentId + '/sign', { regulatorAddress, keyId, docHash, title });
  }

  async regulatorSubmissionsList(regulatorAddress: string, start = 1, offset = 50) {
    return await this.authGet('/regulator/submissions', { regulatorAddress, start: String(start), offset: String(offset) });
  }

  // ─── Transaction Operations ───────────────────────────────────────────────────

  async transactionSubscribe(body: Record<string, any>) {
    return await this.authPost('/transactions/subscribe', body);
  }

  async transactionRedeem(body: Record<string, any>) {
    return await this.authPost('/transactions/redeem', body);
  }

  // ─── eKYC ─────────────────────────────────────────────────────────────────────

  async ekycTransactionInquiry(transactionId: string) {
    return await this.authGet('/ekyc/transaction', { transactionId });
  }

  async ekycFetchImages(transactionId: string, isCropped = false) {
    return await this.authGet('/ekyc/images', { transactionId, isCropped: String(isCropped) });
  }

  async ekycVerifyNID(idFrontFile: File, idBackFile: File) {
    try {
      const formData = new FormData();
      formData.append('idFront', idFrontFile);
      formData.append('idBack', idBackFile);

      const response = await fetch(this.apiURL + '/ekyc/nid/verify', {
        method: 'POST',
        headers: await this.authHeader(),
        body: formData
      });

      const data = await response.json();
      if (!response.ok || data?.error) return null;
      return data;
    } catch {
      return null;
    }
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
      const globalSaltBigInt = BigInt(this.ethersService.globalSalt);

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
  
  // ─── Activity Logs ──────────────────────────────────────────────────────────

  async vaultPostActivityLog(body: Record<string, any>) {
    try {
      await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/vault/activity-log',
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
        },
        data: body,
      });
    } catch {}
  }

  async vaultPostAuditLog(body: Record<string, any>) {
    try {
      await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/vault/audit-log',
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
        data: body,
      });
    } catch {}
  }

  // ─── Audit Trail ──────────────────────────────────────────────────────────
  async auditMe(filters: {
    from?: string; to?: string; category?: string; action?: string;
    actor?: string; contract?: string; refNo?: string;
    page?: number; pageSize?: number;
  } = {}) {
    const params: Record<string, string> = {};
    if (filters.from)      params['from']     = filters.from;
    if (filters.to)        params['to']       = filters.to;
    if (filters.category)  params['category'] = filters.category;
    if (filters.action)    params['action']   = filters.action;
    if (filters.actor)     params['actor']    = filters.actor;
    if (filters.contract)  params['contract'] = filters.contract;
    if (filters.refNo)     params['refNo']    = filters.refNo;
    if (filters.page)      params['page']     = String(filters.page);
    if (filters.pageSize)  params['pageSize'] = String(filters.pageSize);
    return this.authGet('/audit/me', params);
  }

  async auditSystem(filters: {
    actor?: string; target?: string; contract?: string; refNo?: string;
    category?: string; action?: string;
    from?: string; to?: string; page?: number; pageSize?: number;
  } = {}) {
    const params: Record<string, string> = {};
    if (filters.actor)     params['actor']    = filters.actor;
    if (filters.target)    params['target']   = filters.target;
    if (filters.contract)  params['contract'] = filters.contract;
    if (filters.refNo)     params['refNo']    = filters.refNo;
    if (filters.category)  params['category'] = filters.category;
    if (filters.action)    params['action']   = filters.action;
    if (filters.from)      params['from']     = filters.from;
    if (filters.to)        params['to']       = filters.to;
    if (filters.page)      params['page']     = String(filters.page);
    if (filters.pageSize)  params['pageSize'] = String(filters.pageSize);
    return this.authGet('/audit/system', params);
  }

  async auditByRef(refNo: string) {
    return this.authGet('/audit/ref/' + refNo);
  }

  async auditById(id: number | string) {
    return this.authGet('/audit/by-id/' + encodeURIComponent(String(id)));
  }

  async auditByTarget(address: string, page = 1, pageSize = 50) {
    return this.authGet('/audit/target/' + address, { page: String(page), pageSize: String(pageSize) });
  }

  async auditVerify(range?: { from?: number | string; to?: number | string }) {
    const params: Record<string, string> = {};
    if (range?.from != null) params['from'] = String(range.from);
    if (range?.to   != null) params['to']   = String(range.to);
    return this.authGet('/audit/verify', params);
  }

  async vaultGetActivityLogs(start = 1, offset = 50, category?: string, userId?: number) {
    const params: Record<string, any> = { start: String(start), offset: String(offset) };
    if (category) params['category'] = category;
    if (userId) params['user_id'] = String(userId);
    return this.vaultGet('/activity-logs', params);
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

  // ─── Connect (messaging) ──────────────────────────────────────────────────
  async connectInboxRegister()                       { return this.vaultPost('/connect/inbox/register', {}); }
  async connectInboxInfo()                           { return this.vaultGet ('/connect/inbox'); }
  async connectInboxSetDND(enabled: boolean)         { return this.vaultPost('/connect/inbox/dnd', { enabled }); }
  async connectInboxBlock(counterparty: string)      { return this.vaultPost('/connect/inbox/block', { counterparty }); }
  async connectInboxUnblock(addr: string)            { return this.vaultDelete('/connect/inbox/block/' + addr); }

  async connectThreadsList(start = 1, offset = 50)   { return this.vaultGet (`/connect/threads?start=${start}&offset=${offset}`); }
  async connectThreadCreate(body: any)               { return this.vaultPost('/connect/threads', body); }
  async connectThreadGet(id: number)                 { return this.vaultGet ('/connect/threads/' + id); }
  async connectThreadClose(id: number, reason = '')  { return this.vaultPost(`/connect/threads/${id}/close`, { reason }); }
  async connectThreadBroadcast(id: number, text: string, contentType = 4) {
    return this.vaultPost(`/connect/threads/${id}/broadcast`, { text, contentType });
  }

  async connectMessagesList(threadId: number, start = 1, offset = 100) {
    return this.vaultGet(`/connect/threads/${threadId}/messages?start=${start}&offset=${offset}`);
  }
  async connectMessageSend(threadId: number, body: { recipient?: string; subscriptionAddr?: string; text: string; contentType?: number }) {
    return this.vaultPost(`/connect/threads/${threadId}/messages`, body);
  }
  async connectMessageContent(cid: string) {
    return this.vaultGet('/connect/content/' + encodeURIComponent(cid));
  }
  async connectMessageMarkRead(id: number)           { return this.vaultPost(`/connect/messages/${id}/read`, {}); }
  async connectMessagesMarkBatchRead(messageIds: number[]) { return this.vaultPost('/connect/messages/read-batch', { messageIds }); }
  async connectMessageTombstone(id: number)          { return this.vaultPost(`/connect/messages/${id}/tombstone`, {}); }

  async connectRecipientsSearch(type: 'entity' | 'regulator' | 'subscription' | 'service', q: string) {
    return this.vaultGet(`/connect/recipients/search?type=${type}&q=${encodeURIComponent(q)}`);
  }

  // ─── Directory (unified address → name/partyType resolver) ────────────────
  async directoryByAddress(address: string) { return this.vaultGet('/directory/by-address/' + address); }

  // ─── User attribution helper ──────────────────────────────────────────────
  // Connect threads + messages carry a `createdByUserId: bytes32` hex hash.
  // For the entity's own users this is the integer id zero-padded to 32 bytes.
  // Decode and look up via /users/:id; cross-tenant ids that don't resolve
  // here return null and the caller falls back to the address-based label.
  async userByCreatedByHash(hash: string | null | undefined): Promise<{ id: number; name: string; username?: string; role?: number } | null> {
    if (!hash || /^0x0+$/.test(hash)) return null;
    let id: number;
    try { id = Number(BigInt(hash)); } catch { return null; }
    if (!Number.isFinite(id) || id <= 0) return null;
    try {
      const u = await this.vaultGetUser(String(id));
      if (!u) return null;
      return { id, name: u.name || u.username || ('user ' + id), username: u.username, role: u.role };
    } catch { return null; }
  }

  // ─── Approvals (maker/checker workflow) ────────────────────────────────────
  // Mounted on /api/v1/approvals* and /api/v1/users/:id/approval-role (NOT
  // under /vault/...) so we use the authPut/Get/Post/Delete wrappers.

  async vaultApprovalsList(opts: { state?: number; category?: string; target?: string; makerUserId?: string; start?: number; offset?: number } = {}) {
    const params: any = {};
    if (opts.state != null)    params.state        = opts.state;
    if (opts.category)         params.category     = opts.category;
    if (opts.target)           params.target       = opts.target;
    if (opts.makerUserId)      params.makerUserId  = opts.makerUserId;
    if (opts.start  != null)   params.start        = opts.start;
    if (opts.offset != null)   params.offset       = opts.offset;
    return this.authGet('/approvals', params);
  }
  async vaultApprovalGet(requestId: string)                    { return this.authGet('/approvals/' + requestId); }
  async vaultApprovalApprove(requestId: string, reason = '')   { return this.authPost('/approvals/' + requestId + '/approve', { reason }); }
  async vaultApprovalReject(requestId: string, reason: string) { return this.authPost('/approvals/' + requestId + '/reject',  { reason }); }
  async vaultApprovalCancel(requestId: string)                 { return this.authDelete('/approvals/' + requestId); }

  // Admin: policy + per-user roles
  async vaultApprovalsPolicyList()                                              { return this.authGet('/approvals/policy'); }
  async vaultApprovalsPolicySet(category: string, requiresApproval: boolean)    { return this.authPut('/approvals/policy/' + category, { requiresApproval }); }
  async vaultUserApprovalRoleGet(userId: number | string)                       { return this.authGet('/users/' + userId + '/approval-role'); }
  async vaultUserApprovalRoleSet(userId: number | string, approvalRole: 'none' | 'maker' | 'checker') { return this.authPut('/users/' + userId + '/approval-role', { approvalRole }); }
}
