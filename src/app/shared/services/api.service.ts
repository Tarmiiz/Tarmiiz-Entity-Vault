import { inject, Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { CapacitorHttp } from '@capacitor/core';

import { EthersService } from './ethers.service';
import { ConfigService } from './config.service';
import { SessionService } from './session.service';
import { PARTY_CLASS, ServiceParties } from '../constants/party-class';

import {
  FeeConfig, ExternalIntegration, UserGroup, AppConfigItem,
  CreditPosition, CreditObligation, CreditSettlement,
  ClearingDelivery, ClearingHold, ClearingCycle, ClearingPosition, ClearingMember, ClearingAccount,
  DistributionAgreement, PrimaryTrade, DexOffering,
  DexDeal, DexDealRound, DexDealCounterparty, DexRfqRequest, DexRfqDealer,
  ServiceCoverageAggregate, ServiceLiquidityRow, IdentityDisclosure,
} from '../models/data.model';

/**
 * The tenant feature envelope returned by GET /vault/features[/me].
 * `vaultMode` is the 'Entity Mode' Global Variables variable_id (1 = Token Issuer);
 * `modeMenu` is the menu-key allow-list that mode permits, `null` = unrestricted.
 */
export interface VaultFeatures {
  dex: boolean;
  vaultMode: number | null;
  vaultModeName: string | null;
  modeMenu: string[] | null;
  // Decimal places every MONEY value renders with (app_config CURRENCY_DECIMALS).
  // null = the server did not answer; the caller keeps its current value.
  currencyDecimals: number | null;
  menu: Record<string, boolean>;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {

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

  apiURL = this.configService.get('apiURL');

  // Public (no-auth) URL that streams the tenant entity's avatar image (folded media.avatar).
  // Bound directly by the login page + app-shell logo; 404s when no avatar is set so the
  // template's (error) handler falls back to the static logo.
  get avatarUrl(): string { return this.apiURL + '/avatar'; }

  private async authHeader(): Promise<Record<string, string>> {
    const token = await this.sessionService.getActiveToken();
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  }

  private getAuditHeaders(): Record<string, string> {
    try {
      // Lazy resolution to avoid circular dependency (AuthService ↔ ApiService)
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
        url: this.apiURL + '/config',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.data?.type !== 'success') return null;
      return response.data.config ?? null;
    } catch {
      return null;
    }
  }

  // vaultMode is the 'Entity Mode' Global Variables variable_id; modeMenu is the menu-key
  // allow-list that mode permits (null = unrestricted, i.e. Token Issuer).
  async vaultFeatures(): Promise<VaultFeatures | null> {
    try {
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + '/features',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.data?.type !== 'success') return null;
      const features = response.data.features ?? {};
      return {
        dex: !!features.dex,
        vaultMode: features.vaultMode != null ? Number(features.vaultMode) : null,
        vaultModeName: features.vaultModeName ?? null,
        modeMenu: features.modeMenu ?? null,
        currencyDecimals: features.currencyDecimals != null ? Number(features.currencyDecimals) : null,
        menu: response.data.menu ?? {},
      };
    } catch {
      return null;
    }
  }

  // Menu config (admin Menu Settings page) — JWT-gated under /vault/...
  async vaultMenuConfigList(): Promise<{ menuKey: string; enabled: boolean; updatedAt: number | null; updatedByUserId: string | null; license: any }[]> {
    const data = await this.vaultGet('/menu-config');
    return (data?.menu ?? []).map((r: any) => ({
      menuKey: r.menu_key,
      enabled: !!r.enabled,
      updatedAt: r.updated_at != null ? Number(r.updated_at) : null,
      updatedByUserId: r.updated_by_user_id ?? null,
      // ⚠️ This mapper builds an EXPLICIT object, so a field the API adds is DROPPED unless it is
      // named here — and a dropped `license` renders as "unknown", the reassuring answer, on every
      // row. Any future field the licence surface adds must be added here too.
      license: r.license ?? null,
    }));
  }

  async vaultMenuConfigSet(key: string, enabled: boolean) {
    return this.vaultPut('/menu-config/' + key, { enabled });
  }

  // Authenticated per-user effective feature map (tenant folded with this user's
  // restrict-only overrides). Same shape as vaultFeatures() plus the systemFunctions map;
  // read once a session exists.
  async vaultMyFeatures(): Promise<(VaultFeatures & { systemFunctions: Record<string, boolean> }) | null> {
    const data = await this.vaultGet('/features/me');
    if (!data) return null;
    const features = data.features ?? {};
    return {
      dex: !!features.dex,
      vaultMode: features.vaultMode != null ? Number(features.vaultMode) : null,
      vaultModeName: features.vaultModeName ?? null,
      modeMenu: features.modeMenu ?? null,
      currencyDecimals: features.currencyDecimals != null ? Number(features.currencyDecimals) : null,
      menu: data.menu ?? {},
      systemFunctions: data.systemFunctions ?? {},
    };
  }

  // Per-user menu overrides (admin Menu Access tab on User Details). Rows carry the
  // three layers: userEnabled (explicit override), groupEnabled (assigned User Group's
  // setting — null when no group row / group inert), and the folded effective value.
  async vaultUserMenuConfigList(userId: string | number): Promise<
    { menuKey: string; tenantEnabled: boolean; userEnabled: boolean | null; groupEnabled: boolean | null; effective: boolean; license: any }[]
  > {
    const data = await this.vaultGet('/staff/' + userId + '/menu-config');
    return (data?.menu ?? []).map((r: any) => ({
      menuKey: r.menuKey,
      tenantEnabled: !!r.tenantEnabled,
      userEnabled: r.userEnabled === null || r.userEnabled === undefined ? null : !!r.userEnabled,
      groupEnabled: r.groupEnabled === null || r.groupEnabled === undefined ? null : !!r.groupEnabled,
      effective: !!r.effective,
      // Explicit mapper — an unnamed field is DROPPED, and a dropped licence renders as "unknown".
      license: r.license ?? null,
    }));
  }

  async vaultUserMenuConfigSet(userId: string | number, key: string, enabled: boolean) {
    return this.vaultPut('/staff/' + userId + '/menu-config/' + key, { enabled });
  }

  // Remove a per-user override so the key falls back to the group setting / role default.
  async vaultUserMenuConfigClear(userId: string | number, key: string) {
    return this.vaultDelete('/staff/' + userId + '/menu-config/' + key);
  }

  // Per-user System Functions (admin System Functions tab on User Details). Returns only the
  // functions applicable to the target user's role (empty ⇒ tab hidden).
  async vaultUserSystemFunctionConfigList(userId: string | number): Promise<
    { functionKey: string; defaultEnabled: boolean; userEnabled: boolean | null; groupEnabled: boolean | null; effective: boolean; license: any }[]
  > {
    const data = await this.vaultGet('/staff/' + userId + '/system-functions');
    return (data?.functions ?? []).map((r: any) => ({
      functionKey: r.functionKey,
      defaultEnabled: !!r.defaultEnabled,
      userEnabled: r.userEnabled === null || r.userEnabled === undefined ? null : !!r.userEnabled,
      groupEnabled: r.groupEnabled === null || r.groupEnabled === undefined ? null : !!r.groupEnabled,
      effective: !!r.effective,
      // Explicit mapper — an unnamed field is DROPPED, and a dropped licence renders as "unknown".
      license: r.license ?? null,
    }));
  }

  async vaultUserSystemFunctionConfigSet(userId: string | number, key: string, enabled: boolean) {
    return this.vaultPut('/staff/' + userId + '/system-functions/' + key, { enabled });
  }

  async vaultUserSystemFunctionConfigClear(userId: string | number, key: string) {
    return this.vaultDelete('/staff/' + userId + '/system-functions/' + key);
  }

  // ── User Groups (role-scoped Menu Access + System Functions presets) ─────────────
  async vaultUserGroupsList(): Promise<UserGroup[]> {
    const data = await this.vaultGet('/staff-groups');
    return (data?.groups ?? []).map((g: any) => this.mapUserGroup(g));
  }

  async vaultUserGroupGet(groupId: string): Promise<UserGroup | null> {
    const data = await this.vaultGet('/staff-groups/' + groupId);
    return data?.group ? this.mapUserGroup(data.group) : null;
  }

  async vaultUserGroupCreate(body: { name: string; description?: string; role: number }) {
    return this.vaultPost('/staff-groups', body);
  }

  async vaultUserGroupUpdate(groupId: string, body: { name?: string; description?: string }) {
    return this.vaultPut('/staff-groups/' + groupId, body);
  }

  async vaultUserGroupDelete(groupId: string) {
    return this.vaultDelete('/staff-groups/' + groupId);
  }

  async vaultUserGroupMenuConfigList(groupId: string): Promise<
    { menuKey: string; tenantEnabled: boolean; groupEnabled: boolean | null; effective: boolean; license: any }[]
  > {
    const data = await this.vaultGet('/staff-groups/' + groupId + '/menu-config');
    return (data?.menu ?? []).map((r: any) => ({
      menuKey: r.menuKey,
      tenantEnabled: !!r.tenantEnabled,
      groupEnabled: r.groupEnabled === null || r.groupEnabled === undefined ? null : !!r.groupEnabled,
      effective: !!r.effective,
      // Explicit mapper — an unnamed field is DROPPED, and a dropped licence renders as "unknown".
      license: r.license ?? null,
    }));
  }

  async vaultUserGroupMenuConfigSet(groupId: string, key: string, enabled: boolean) {
    return this.vaultPut('/staff-groups/' + groupId + '/menu-config/' + key, { enabled });
  }

  async vaultUserGroupSystemFunctionConfigList(groupId: string): Promise<
    { functionKey: string; defaultEnabled: boolean; groupEnabled: boolean | null; effective: boolean; license: any }[]
  > {
    const data = await this.vaultGet('/staff-groups/' + groupId + '/system-functions');
    return (data?.functions ?? []).map((r: any) => ({
      functionKey: r.functionKey,
      defaultEnabled: !!r.defaultEnabled,
      groupEnabled: r.groupEnabled === null || r.groupEnabled === undefined ? null : !!r.groupEnabled,
      effective: !!r.effective,
      // Explicit mapper — an unnamed field is DROPPED, and a dropped licence renders as "unknown".
      license: r.license ?? null,
    }));
  }

  async vaultUserGroupSystemFunctionConfigSet(groupId: string, key: string, enabled: boolean) {
    return this.vaultPut('/staff-groups/' + groupId + '/system-functions/' + key, { enabled });
  }

  async vaultUserGroupMembers(groupId: string): Promise<{ userId: string; assignedAt: number }[]> {
    const data = await this.vaultGet('/staff-groups/' + groupId + '/members');
    return (data?.members ?? []).map((m: any) => ({ userId: String(m.userId), assignedAt: Number(m.assignedAt) }));
  }

  // Per-user membership: the user's assigned group (null when none) + whether its target
  // role still matches the user's on-chain role (false ⇒ the group layer is inert).
  async vaultUserGroupMembershipGet(userId: string | number): Promise<{ group: UserGroup | null; roleMatch: boolean }> {
    const data = await this.vaultGet('/staff/' + userId + '/group');
    return {
      group: data?.group ? this.mapUserGroup(data.group) : null,
      roleMatch: data?.roleMatch !== false,
    };
  }

  async vaultUserGroupMembershipSet(userId: string | number, groupId: string) {
    return this.vaultPut('/staff/' + userId + '/group', { groupId });
  }

  async vaultUserGroupMembershipClear(userId: string | number) {
    return this.vaultDelete('/staff/' + userId + '/group');
  }

  private mapUserGroup(g: any): UserGroup {
    return {
      groupId: String(g.groupId),
      name: g.name ?? '',
      description: g.description ?? null,
      role: Number(g.role),
      memberCount: g.memberCount != null ? Number(g.memberCount) : 0,
      createdAt: g.createdAt != null ? Number(g.createdAt) : null,
      updatedAt: g.updatedAt != null ? Number(g.updatedAt) : null,
    };
  }

  // Settings backup (on-chain encrypted fallback for the DB-only settings tables) — admin page
  async vaultSettingsBackupStatus(): Promise<{ name: string; localRows: number; chainCreatedAt: number | null; chainUpdatedAt: number | null }[]> {
    const data = await this.vaultGet('/settings-backup/status');
    return (data?.settings ?? []).map((r: any) => ({
      name: r.name,
      localRows: Number(r.localRows ?? 0),
      chainCreatedAt: r.chainCreatedAt != null ? Number(r.chainCreatedAt) : null,
      chainUpdatedAt: r.chainUpdatedAt != null ? Number(r.chainUpdatedAt) : null,
    }));
  }

  async vaultSettingsBackupRun(name?: string) {
    return this.vaultPost('/settings-backup/backup', name ? { name } : {});
  }

  async vaultSettingsBackupRestore(name?: string) {
    return this.vaultPost('/settings-backup/restore', name ? { name } : {});
  }

  // External API integrations (admin-managed params; encrypted in DB, chain-backed) — admin page.
  // Pure config records — the former eKYC adapter binding / test / service links are gone.
  async vaultIntegrations(): Promise<ExternalIntegration[]> {
    const data = await this.vaultGet('/integrations');
    return (data?.integrations ?? []) as ExternalIntegration[];
  }

  async vaultIntegrationCreate(body: { name: string; displayName?: string; category: string; enabled?: boolean; isDefault?: boolean; params?: Record<string, { value?: string; secret?: boolean } | null> }) {
    return this.vaultPost('/integrations', body);
  }

  async vaultIntegrationUpdate(name: string, body: { displayName?: string; enabled?: boolean; isDefault?: boolean; params?: Record<string, { value?: string; secret?: boolean } | null> }) {
    return this.vaultPut('/integrations/' + name, body);
  }

  async vaultIntegrationDelete(name: string) {
    return this.vaultDelete('/integrations/' + name);
  }

  // Runtime app configuration (DB-backed .env overrides) — admin page.
  async getAppConfig(): Promise<AppConfigItem[]> {
    const data = await this.vaultGet('/app-config');
    return (data?.config ?? []) as AppConfigItem[];
  }

  async setAppConfig(key: string, value: any) {
    return this.vaultPut('/app-config/' + encodeURIComponent(key), { value });
  }

  // ── Settings → API Endpoints (Phase 26.7) ────────────────────────────────────────────────
  //
  // ⚠️ ALL THREE ARE VAULT-TIER, including the LIST. A service token must not be able to
  // enumerate — let alone flip — the switches that restrain it, so `vaultGet` is correct here
  // and an integration-tier read would defeat the control.
  //
  // `encodeURIComponent` on the key, as `setAppConfig` does: registry keys are camelCase today
  // but the path segment must survive whatever a future generated key contains.
  async vaultApiEndpointsList(): Promise<{ endpoints: any[]; sections: { section: string; items: any[] }[] }> {
    const data = await this.vaultGet('/api-endpoints');
    // Registry order is the SERVER's — returned untouched. Do not sort or re-group here.
    return { endpoints: data?.endpoints ?? [], sections: data?.sections ?? [] };
  }

  async vaultApiEndpointSet(key: string, enabled: boolean) {
    return this.vaultPut('/api-endpoints/' + encodeURIComponent(key), { enabled });
  }

  async vaultApiEndpointReset(key: string) {
    return this.vaultPost('/api-endpoints/' + encodeURIComponent(key) + '/reset', {});
  }

  async resetAppConfig(key: string) {
    return this.vaultPost('/app-config/' + encodeURIComponent(key) + '/reset', {});
  }

  // ─── Vault helpers ────────────────────────────────────────────────────────────

  private async vaultGet(path: string, params?: Record<string, any>) {
    try {
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + path,
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
        url: this.apiURL + path,
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
        url: this.apiURL + path,
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

  // `body` is optional and only sent when supplied, so every existing call site is
  // unchanged. Needed because withdrawing a deal is semantically a DELETE but must
  // still name WHICH of our subscriptions is acting (and the round we rendered).
  private async vaultDelete(path: string, body?: Record<string, any>) {
    try {
      const response = await CapacitorHttp.request({
        method: 'DELETE',
        url: this.apiURL + path,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.authHeader()),
          ...this.getAuditHeaders(),
        },
        ...(body ? { data: body } : {}),
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
        url: this.apiURL + path,
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
  // TWO AXES, and 2026-08-09 changed only one of them. PARTICIPATION (`allowP2P`) became
  // chain-derived from whether the service has a registered payment processor; SETTLEMENT
  // (`settlementMode`: 1 = venue settles its own DvP, 2 = books and matching only) stayed
  // caller-supplied and IMMUTABLE. This method dropped BOTH, so the API - which requires
  // settlementMode with no default - 400'd every create from the Vault.
  async vaultDexVenueCreate(serviceAddress: string, settlementMode: number) {
    return this.vaultPost('/dex/venues', { serviceAddress, settlementMode });
  }
  async vaultDexVenueSetState(address: string, newState: number) {
    return this.vaultPut('/dex/venues/' + address + '/state', { newState });
  }

  // Venue members (venue-operator side) + memberships (member-brokerage side).
  async vaultDexVenueMembers(address: string) {
    const data = await this.vaultGet('/dex/venues/' + address + '/members');
    return data ? { count: data.count, members: data.members } : null;
  }
  // The VENUE consents to a request (venueAcceptAsset twin). INVERTED 2026-08-11: this was the
  // member accepting an invitation. To REJECT, call vaultDexVenueMemberRemove — there is no
  // separate reject route, matching the pairing surface where remove doubles as reject.
  async vaultDexVenueMemberAccept(address: string, member: string) {
    return this.vaultPut('/dex/venues/' + address + '/members/' + member + '/accept', {});
  }
  async vaultDexVenueMemberRemove(address: string, member: string) {
    return this.vaultDelete('/dex/venues/' + address + '/members/' + member);
  }
  // Venue hosting — this venue's own leg on an (asset, venue) pairing. The mirror
  // image of the vaultDexAssetListingVenue* trio below, which is the ISSUER's side
  // of the same relation and is gated on-chain to the asset's issuer.
  async vaultDexVenueAssetAccept(address: string, asset: string) {
    return this.vaultPut('/dex/venues/' + address + '/assets/' + asset + '/accept', {});
  }
  async vaultDexVenueAssetSetHalted(address: string, asset: string, halted: boolean, reason: string) {
    return this.vaultPut('/dex/venues/' + address + '/assets/' + asset + '/halt', { halted, reason });
  }
  async vaultDexVenueAssetRemove(address: string, asset: string) {
    return this.vaultDelete('/dex/venues/' + address + '/assets/' + asset);
  }
  async vaultDexMemberships() {
    const data = await this.vaultGet('/dex/memberships');
    return data ? { count: data.count, memberships: data.memberships } : null;
  }
  // The MEMBER requests to join. INVERTED 2026-08-11: the venue used to invite by address, so a
  // brokerage could not reach a market without persuading its operator to type its address.
  async vaultDexMembershipRequest(dexService: string, memberService: string) {
    return this.vaultPost('/dex/memberships', { dexService, memberService });
  }
  // Drives the venue picker behind the request — filtered server-side to same-country, live,
  // brokerage-licensed venues we do not already hold a membership row for.
  async vaultDexMembershipEligibleVenues() {
    const data = await this.vaultGet('/dex/memberships/eligible-venues');
    return data ? { count: data.count, venues: data.venues } : null;
  }
  async vaultDexMembershipRemove(venue: string, member: string) {
    return this.vaultDelete('/dex/memberships/' + venue + '/' + member);
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

  // ── The venue CONTRACT (Phase 16 A6) ──────────────────────────────────────
  //
  // Until these landed, `venueSetContract` had no caller anywhere in the product, so
  // every venue on every chain answered `venueAct` with "venue has no contract bound".
  //
  // The catalog is an INTEGRATION route (a plain authenticated read — the kit-library
  // addresses are public bytecode literals, and check-route-audience enforces that
  // split); the other two are vault routes behind requireExecutive. `vaultGet` serves
  // both — it is "authenticated GET", not a vault-only prefix.
  async vaultDexVenueTemplates() {
    const data = await this.vaultGet('/dex/venue-templates');
    return data ? { templates: data.templates ?? [], libraries: data.libraries ?? {} } : null;
  }
  /** Read-only dry run of the on-chain conformance checks. POST only because it takes a body. */
  async vaultDexVenueContractVerify(address: string, candidate: string) {
    return this.vaultPost(`/dex/venues/${address}/contract/verify`, { candidate });
  }
  /**
   * Deploy-and-bind, bind an existing address, or unbind.
   *
   * ⚠️ A successful bind AUTO-SUSPENDS the venue — a change to the reviewed thing resets
   * the review — so the caller must surface `notice`, not just a success toast.
   */
  async vaultDexVenueContractSet(address: string, body: { creationCode?: string; name?: string; venueContract?: string | null }) {
    return this.vaultPut(`/dex/venues/${address}/contract`, body);
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
  async vaultDexOrderInfo(ref: string) {
    const data = await this.vaultGet("/dex/orders/" + ref);
    return data?.order ?? null;
  }
  // `expiresAt` is time in force: unix SECONDS, 0 = good-till-cancelled. NOT milliseconds —
  // the order row reports its expiry back in ms, and the two units meet on this one feature.
  async vaultDexPlaceOrder(body: { subscription: string; dexService: string; baseAsset: string; side: number; price: string; amount: string; expiresAt?: number }) {
    return this.vaultPost('/dex/orders', body);
  }
  async vaultDexCancelOrder(ref: string) {
    return this.vaultPut('/dex/orders/' + ref + '/cancel', {});
  }
  /** Close a LAPSED order and return its escrow. Permissionless on chain — see the API route. */
  async vaultDexExpireOrder(ref: string) {
    return this.vaultPut('/dex/orders/' + ref + '/expire', {});
  }
  // Phase 16 — the body takes `bytes32` COMMITMENT REFS. It sent `buyOrderId`/`sellOrderId`
  // until 2026-09-01, which the API rejects outright ("buyRef and sellRef are required"), so
  // Match Selected could never have worked. The API's own handler notes it refuses the old
  // names rather than aliasing them: a caller still sending a numeric id has nothing usable.
  async vaultDexMatchOrders(buyRef: string, sellRef: string) {
    return this.vaultPut('/dex/match', { buyRef, sellRef });
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

  // May this service post a ledger row dated other than now? (D6 evidence marks.)
  //
  // Every credit form with an optional transaction-time field must ask BEFORE offering it:
  // `CreditProxy.deposit` refuses a timestamp that is neither 0 nor exactly `block.timestamp`
  // unless the regulator granted this service the capability, so on an ungranted service any
  // value in that field is a guaranteed revert — and there is no browser value that equals
  // `block.timestamp` in the first place (chain time lags wall clock, and `datetime-local` has a
  // 60 s step), so it cannot even be satisfied by entering the current time.
  //
  // Fails CLOSED. A null response (transport failure, or a body that isn't the success envelope)
  // means we could not measure it, and an unmeasured capability must read as absent — never as
  // permission.
  async vaultGetServiceBackdating(service: string): Promise<{ granted: boolean; available: boolean }> {
    const data = await this.vaultGet('/services/' + service + '/backdating');
    if (!data) return { granted: false, available: false };
    return { granted: data.granted === true, available: data.available === true };
  }

  // Service-side fee config (uniform D7b engine, 2026-08-03) — keyed by (service, asset)
  // on the distributing/venue ServiceTemplate. THE only fee surface: the asset-side
  // per-service fee config was removed with the issuer/DEX model redesign. Each side
  // carries { mode, value, bearing (0 OnTop / 1 Deducted) }; the destination is forced
  // on-chain to the configuring service's own account.
  // ⚠ `feeConfig` is the RAW per-asset override and stays that way — edit forms pre-fill from
  // it, so returning the effective value here would make every Save silently PIN an override.
  // `effective` is what the chain will quote; `isSet` says which of the two you are looking at.
  async vaultGetServiceFeeConfig(service: string, asset: string): Promise<{
    feeConfig: FeeConfig | null; isSet: boolean; source: string;
    default: FeeConfig | null; effective: FeeConfig | null;
  } | null> {
    const data = await this.vaultGet('/services/' + service + '/assets/' + asset + '/fee-config');
    if (!data) return null;
    return {
      feeConfig: data.feeConfig ?? null,
      isSet:     data.isSet === true,
      source:    data.source ?? 'none',
      default:   data.default ?? null,
      effective: data.effective ?? null,
    };
  }

  // The SERVICE-LEVEL default every un-overridden asset inherits — one write covers every
  // listing. A sibling literal path, deliberately not an asset sentinel (see the API routes).
  async vaultGetServiceDefaultFeeConfig(service: string): Promise<{ feeConfig: FeeConfig | null } | null> {
    const data = await this.vaultGet('/services/' + service + '/fee-config');
    if (!data) return null;
    return { feeConfig: data.feeConfig ?? null };
  }

  async vaultSetServiceDefaultFeeConfig(service: string, feeConfig: FeeConfig) {
    const data = await this.vaultPut('/services/' + service + '/fee-config', { feeConfig });
    return data ?? null;
  }

  // Reset-to-inherit. NOT the same as saving an all-None config, which means "this asset is
  // free" and still overrides the default.
  async vaultClearServiceFeeConfig(service: string, asset: string) {
    const data = await this.vaultDelete('/services/' + service + '/assets/' + asset + '/fee-config');
    return data ?? null;
  }

  async vaultSetServiceFeeConfig(service: string, asset: string, feeConfig: FeeConfig) {
    const data = await this.vaultPut('/services/' + service + '/assets/' + asset + '/fee-config', { feeConfig });
    return data ?? null;
  }

  async vaultQuoteServiceFee(service: string, asset: string, direction: number, gross: string | number) {
    const data = await this.vaultGet('/services/' + service + '/assets/' + asset + '/quote-fee', { direction, gross });
    return data ?? null;
  }

  // ─── Settlements (fiat obligations / net positions, issuer/DEX model 2026-08-03) ──

  async vaultSettlementPositions(): Promise<CreditPosition[]> {
    const data = await this.vaultGet('/settlements/positions');
    return data?.positions ?? [];
  }

  // Live chain pre-flight for a settlement amount: { netOwedByCaller, inFlightOwedByCaller,
  // inFlightOwedToCaller } as whole-currency decimal strings.
  async vaultSettlementPositionWith(counterparty: string, currencyCode: number | string) {
    const data = await this.vaultGet('/settlements/positions/' + counterparty + '/' + currencyCode);
    return data?.position ?? null;
  }

  async vaultSettlementObligations(params: { counterparty?: string; currencyCode?: number; start?: number; offset?: number } = {}) {
    const data = await this.vaultGet('/settlements/obligations', params);
    return data ? { totalCount: data.totalCount ?? 0, obligations: (data.obligations ?? []) as CreditObligation[] } : null;
  }

  async vaultSettlementsList(params: { counterparty?: string; state?: number; start?: number; offset?: number } = {}) {
    const data = await this.vaultGet('/settlements', params);
    return data ? { totalCount: data.totalCount ?? 0, settlements: (data.settlements ?? []) as CreditSettlement[] } : null;
  }

  async vaultSettlementInfo(debtor: string, creditor: string, id: number) {
    const data = await this.vaultGet('/settlements/' + debtor + '/' + creditor + '/' + id);
    return (data?.settlement ?? null) as CreditSettlement | null;
  }

  // Debtor-side create. amount is a WHOLE-CURRENCY amount (the API wei-encodes).
  async vaultSettlementCreate(payload: { counterparty: string; currencyCode: number; amount: string; memo?: string }) {
    return this.vaultPost('/settlements', payload);
  }

  // Debtor-side confirm sent — multipart: wire reference + optional receipt file
  // (pinned as an encrypted settlement-receipt document at execution time).
  async vaultSettlementConfirmSent(
    payload: { debtorEntity: string; creditorEntity: string; settlementId: number; wireRef: string; currencyCode: number; amount: string; memo?: string },
    receiptFile: File | null,
  ) {
    return this._postMultipartFields('/settlements/confirm-sent', {
      debtorEntity:   payload.debtorEntity,
      creditorEntity: payload.creditorEntity,
      settlementId:   String(payload.settlementId),
      wireRef:        payload.wireRef,
      currencyCode:   String(payload.currencyCode),
      amount:         payload.amount,
      memo:           payload.memo || '',
    }, receiptFile, 'receipt');
  }

  // Creditor-side confirm received — the only net-decrement transition (on-chain).
  async vaultSettlementConfirmReceived(payload: { debtorEntity: string; creditorEntity: string; settlementId: number; note?: string }) {
    return this.vaultPost('/settlements/confirm-received', payload);
  }

  async vaultSettlementCancel(debtor: string, creditor: string, id: number) {
    return this.vaultDelete('/settlements/' + debtor + '/' + creditor + '/' + id);
  }

  // Streams the wire-receipt FILE for one settlement. A settlement records only the receipt's
  // CID (never a documentId), and the document is owned by the DEBTOR's template — the API
  // resolves that per side (own document / inbound share), so both sides call this same path.
  async vaultSettlementReceiptFile(debtor: string, creditor: string, id: number) {
    return this._fetchFileBlob('/settlements/' + debtor + '/' + creditor + '/' + id + '/receipt');
  }

  // ─── Clearing (deferred DvP + central clearing) ───────────────────────────────
  //
  // Reads come off the plugin-owned mirror; the account is a live chain read. Writes split by
  // WHO acts: the CCP operator's verbs, the member's own verbs, and three PERMISSIONLESS triggers
  // that anyone may drive (which is why they carry no maker/checker — queueing a delivery release
  // behind a checker does not delay it, it strands a buyer who already wired real fiat).

  async vaultClearingDeliveries(params: { status?: number; cycle?: string; venue?: string; start?: number; offset?: number } = {}): Promise<ClearingDelivery[]> {
    const data = await this.vaultGet('/clearing/deliveries', params);
    return data?.deliveries ?? [];
  }

  async vaultClearingDelivery(deliveryKey: string) {
    const data = await this.vaultGet('/clearing/deliveries/' + deliveryKey);
    return data ? { delivery: data.delivery as ClearingDelivery, holds: (data.holds ?? []) as ClearingHold[] } : null;
  }

  // ⚠️ The three cycle reads are GONE — their routes were deleted with the cycle family.
  // Netting is continuous; a member's demand is its live margin requirement.

  // Members of a clearing house WE operate.
  async vaultClearingMembers(clearingHouse?: string): Promise<ClearingMember[]> {
    const data = await this.vaultGet('/clearing/members', clearingHouse ? { clearingHouse } : {});
    return data?.members ?? [];
  }

  // The other direction: clearing houses THIS entity is a member of.
  async vaultClearingMemberships(): Promise<ClearingMember[]> {
    const data = await this.vaultGet('/clearing/memberships');
    return data?.memberships ?? [];
  }

  // THE CENTREPIECE — one running account per (member, clearing house, currency). `entity` is
  // permitted only for a member of a clearing house this entity operates; omit it for our own.
  async vaultClearingAccount(clearingHouse: string, currencyCode: number, entity?: string): Promise<ClearingAccount | null> {
    const data = await this.vaultGet('/clearing/account/' + clearingHouse + '/' + currencyCode, entity ? { entity } : {});
    return data?.type === 'success' ? (data as ClearingAccount) : null;
  }

  // CCP-operator verbs.
  async vaultClearingMemberAdmit(payload: { clearingHouse: string; entity: string; fundingService?: string; refNo?: string }) {
    return this.vaultPost('/clearing/members', payload);
  }

  async vaultClearingMemberSetState(clearingHouse: string, entity: string, state: number, refNo?: string) {
    return this.vaultPut('/clearing/members/' + clearingHouse + '/' + entity + '/state', { state, refNo });
  }

  async vaultClearingHouseSetCurrency(payload: { clearingHouse: string; currencyCode: number; cleared?: boolean; refNo?: string }) {
    return this.vaultPost('/clearing/currencies', payload);
  }

  // ⚠️ `vaultClearingCycleClose` and `vaultClearingConfirmPayIn` are REMOVED — the `Cycles`
  // module no longer exists on chain. Multilateral netting by cycle was replaced by the MARGIN
  // model: a continuously maintained margin account tested per delivery, rather than a periodic
  // settlement round. The two do not correspond, so these are deleted rather than re-pointed —
  // closing a cycle has no margin equivalent, and the pay-in confirmation is answered by a
  // margin top-up, which is a different act by a different party.

  // Member-side verbs. There is no `entity` argument on accept BY DESIGN: being made a
  // counterparty of a clearing house is not something a third party may do on your behalf.
  async vaultClearingMemberAccept(clearingHouse: string, refNo?: string) {
    return this.vaultPost('/clearing/memberships/accept', { clearingHouse, refNo });
  }

  async vaultClearingSetFundingService(clearingHouse: string, fundingService: string, refNo?: string) {
    return this.vaultPost('/clearing/memberships/funding-service', { clearingHouse, fundingService, refNo });
  }

  // Permissionless triggers — no maker/checker, deliberately (see the block comment above).
  // `vaultClearingCycleFinalize` went with the rest of the cycle family.

  async vaultClearingDeliveryExecute(deliveryId: string) {
    return this.vaultPost('/clearing/deliveries/execute', { deliveryId });
  }

  // action 1 = hold (a custodian of either side's home service), 2 = hold release (placer-scoped),
  // 3 = fail (permissionless, after the deadline). `id` is a deliveryId for 1 and 3, a holdId for 2.
  async vaultClearingDeliveryAct(action: number, id: string, reason?: string, refNo?: string) {
    return this.vaultPost('/clearing/deliveries/act', { action, id, reason, refNo });
  }

  // ─── Distribution agreements + primary-market trades ──────────────────────────

  async vaultDistributionInbound(): Promise<DistributionAgreement[]> {
    const data = await this.vaultGet('/distribution-agreements/inbound');
    return data?.agreements ?? [];
  }

  async vaultDistributionAccept(asset: string, service: string) {
    return this.vaultPost('/distribution-agreements/' + asset + '/accept', { service });
  }

  async vaultPrimaryTrades(params: { asset?: string; service?: string; subscription?: string; start?: number; offset?: number } = {}) {
    const data = await this.vaultGet('/primary-trades', params);
    return data ? { totalCount: data.totalCount ?? 0, trades: (data.trades ?? []) as PrimaryTrade[] } : null;
  }

  // ─── DEX offerings (primary issuance on a venue — IPO facility) ───────────────

  async vaultDexOfferingsList(params: { venue?: string; asset?: string; status?: number; start?: number; offset?: number } = {}) {
    const data = await this.vaultGet('/dex/offerings', params);
    return data ? { totalCount: data.totalCount ?? 0, offerings: (data.offerings ?? []) as DexOffering[] } : null;
  }

  // A7 (2026-09-10): the whole ReserveParams — kind 1 window · 2 tap · 3 auction; closesAt in
  // unix SECONDS (0 for a tap); allocationPolicy 1 FCFS · 2 pro-rata on a window only.
  async vaultDexOfferingCreate(payload: { baseAsset: string; dexService: string; kind: number; price: string; amount: string; closesAt: number; allocationPolicy: number; refNo: string }) {
    return this.vaultPost('/dex/offerings', payload);
  }

  async vaultDexOfferingCancel(key: string, refNo: string) {
    return this.vaultDelete('/dex/offerings/' + key + '?refNo=' + encodeURIComponent(refNo));
  }

  // Buy from a live tap offering — primary issuance at the offering's frozen price,
  // with the ISSUER as counterparty. `amount` is a plain token count. Available to
  // every entity mode: any entity whose subscription is admitted at the venue may
  // fill, a brokerage buying for a client being the common case.
  async vaultDexOfferingFill(key: string, payload: { subscription: string; amount: string; refNo?: string }) {
    return this.vaultPost('/dex/offerings/' + key + '/fill', payload);
  }

  // ─── DEX negotiated OTC deals (2026-08-07) ─────────────────────────────────
  // Counterparty names are resolved from CHAIN by the API — a deal's far side is
  // cross-tenant by construction, so no mirror join can supply them.

  async vaultDexDealsList(params: {
    venue?: string; asset?: string; status?: number | string; party?: string;
    request?: string; open?: boolean; start?: number; offset?: number;
  } = {}) {
    const q: any = { start: params.start ?? 0, offset: params.offset ?? 200 };
    if (params.venue)  q.venue  = params.venue;
    if (params.asset)  q.asset  = params.asset;
    if (params.party)  q.party  = params.party;
    if (params.request) q.request = params.request;
    if (params.status !== undefined && params.status !== '') q.status = params.status;
    if (params.open) q.open = true;
    const data = await this.vaultGet('/dex/deals', q);
    return data ? { totalCount: data.totalCount ?? 0, deals: (data.deals ?? []) as DexDeal[] } : null;
  }

  /** Deals waiting on US to counter, accept or decline. */
  async vaultDexDealsInbox(start = 0, offset = 200) {
    const data = await this.vaultGet('/dex/deals/inbox', { start, offset });
    return data ? { totalCount: data.totalCount ?? 0, deals: (data.deals ?? []) as DexDeal[] } : null;
  }

  /** The venue operator's pre-trade approval queue. */
  async vaultDexDealsPendingApproval(start = 0, offset = 200) {
    const data = await this.vaultGet('/dex/deals/pending-approval', { start, offset });
    return data ? { totalCount: data.totalCount ?? 0, deals: (data.deals ?? []) as DexDeal[] } : null;
  }

  async vaultDexDealCounterparties(limit = 50) {
    const data = await this.vaultGet('/dex/deals/counterparties', { limit });
    return (data?.counterparties ?? []) as DexDealCounterparty[];
  }

  async vaultDexDealInfo(key: string) {
    const data = await this.vaultGet('/dex/deals/' + key);
    return data ? {
      deal: data.deal as DexDeal,
      rounds: (data.rounds ?? []) as DexDealRound[],
      roundsCount: data.roundsCount ?? 0,
    } : null;
  }

  async vaultDexDealRounds(key: string, start = 0, offset = 200) {
    const data = await this.vaultGet('/dex/deals/' + key + '/rounds', { start, offset });
    return data ? { totalCount: data.totalCount ?? 0, rounds: (data.rounds ?? []) as DexDealRound[] } : null;
  }

  // ─── Deal writes ────────────────────────────────────────────────────────────
  //
  // `price` goes in WHOLE CURRENCY UNITS and `amount` as a plain token count — the
  // API wei-encodes the price and passes the amount through. Do NOT pre-scale either
  // here: this app's convention (unlike the Token Exchange's direct-on-chain path,
  // which hands the contract wei) is that the API owns the conversion.
  //
  // `expectedRound` is the round the page RENDERED. The API compares it against a
  // LIVE chain read and answers 409 on a mismatch, which is what stops a user
  // accepting terms that were countered between the render and the click. Always
  // send it from a UI surface.

  async vaultDexDealPropose(body: {
    subscription: string; dexService: string; counterparty: string; baseAsset: string;
    side: number; funding: number;
    price: number; amount: number; expiresAt: number;
  }) {
    return this.vaultPost('/dex/deals', body);
  }

  async vaultDexDealCounter(key: string, body: { subscription: string; price: number; amount: number; expectedRound?: number }) {
    return this.vaultPost('/dex/deals/' + key + '/counter', body);
  }

  async vaultDexDealAccept(key: string, subscription: string, expectedRound?: number) {
    return this.vaultPut('/dex/deals/' + key + '/accept', { subscription, expectedRound });
  }

  async vaultDexDealDecline(key: string, subscription: string, reason = '', expectedRound?: number) {
    return this.vaultPut('/dex/deals/' + key + '/decline', { subscription, reason, expectedRound });
  }

  /** Withdraw OUR OWN live quote — only the current lastMover may. */
  async vaultDexDealWithdraw(key: string, subscription: string, reason = '', expectedRound?: number) {
    return this.vaultDelete('/dex/deals/' + key, { subscription, reason, expectedRound });
  }

  async vaultDexDealVenueApprove(key: string, reason = '', expectedRound?: number) {
    return this.vaultPut('/dex/deals/' + key + '/venue-approve', { reason, expectedRound });
  }

  async vaultDexDealVenueReject(key: string, reason = '', expectedRound?: number) {
    return this.vaultPut('/dex/deals/' + key + '/venue-reject', { reason, expectedRound });
  }

  // ─── DEX RFQ (2026-08-08) ───────────────────────────────────────────────────
  //
  // An RFQ is a FAN-OUT OVER DEALS, so there is no quote-listing method here by
  // design: a quote IS a deal, read with `vaultDexDealsList({ request: key })`.
  // Likewise `vaultDexRfqAward` is `accept` on the winning CHILD — the endpoint
  // exists to check parentage, not because awarding is its own on-chain verb.

  async vaultDexRfqsList(params: {
    venue?: string; asset?: string; status?: number | string; requester?: string;
    mine?: boolean; invited?: boolean; open?: boolean; start?: number; offset?: number;
  } = {}) {
    const q: any = { start: params.start ?? 0, offset: params.offset ?? 200 };
    if (params.venue)     q.venue     = params.venue;
    if (params.asset)     q.asset     = params.asset;
    if (params.requester) q.requester = params.requester;
    if (params.status !== undefined && params.status !== '') q.status = params.status;
    if (params.mine)    q.mine    = true;
    if (params.invited) q.invited = true;
    if (params.open)    q.open    = true;
    const data = await this.vaultGet('/dex/rfqs', q);
    return data ? { totalCount: data.totalCount ?? 0, requests: (data.requests ?? []) as DexRfqRequest[] } : null;
  }

  /** Open requests we were invited to and have not answered yet. */
  async vaultDexRfqsInbox(start = 0, offset = 200) {
    const data = await this.vaultGet('/dex/rfqs/inbox', { start, offset });
    return data ? { totalCount: data.totalCount ?? 0, requests: (data.requests ?? []) as DexRfqRequest[] } : null;
  }

  /**
   * Header + dealer board. The board is a SEALED AUCTION — the API mirrors every
   * dealer row only when this tenant operates the venue or made the request; as an
   * invited dealer we get our own row alone. Never derive totals from `dealers`;
   * `request.invitedCount` / `quoteCount` are the authoritative ones.
   */
  async vaultDexRfqInfo(key: string) {
    const data = await this.vaultGet('/dex/rfqs/' + key);
    return data ? {
      request: data.request as DexRfqRequest,
      dealers: (data.dealers ?? []) as DexRfqDealer[],
    } : null;
  }

  async vaultDexRfqDealers(key: string) {
    const data = await this.vaultGet('/dex/rfqs/' + key + '/dealers');
    return (data?.dealers ?? []) as DexRfqDealer[];
  }

  /** `amount` is a plain token count; a request carries NO price. */
  async vaultDexRfqCreate(body: {
    subscription: string; dexService: string; baseAsset: string;
    side: number; funding: number;
    amount: number; expiresAt: number; openToAll?: boolean; invited?: string[];
  }) {
    return this.vaultPost('/dex/rfqs', body);
  }

  /** Only PRICE is ours to set — size, expiry, scope and funding come from the request. */
  async vaultDexRfqQuote(key: string, subscription: string, price: number) {
    return this.vaultPost('/dex/rfqs/' + key + '/quotes', { subscription, price });
  }

  /** Award = accept the winning quote. `expectedRound` is the quote's round as rendered. */
  async vaultDexRfqAward(key: string, subscription: string, dealKey: string, expectedRound?: number) {
    return this.vaultPut('/dex/rfqs/' + key + '/award', { subscription, dealKey, expectedRound });
  }

  async vaultDexRfqCancel(key: string, subscription: string, reason = '') {
    return this.vaultDelete('/dex/rfqs/' + key, { subscription, reason });
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
  // Date-based variant: the API resolves the unix-seconds timestamp to the block
  // "as of" that moment, then reconstructs the holder set. Response carries the
  // resolved blockNumber + blockTime so the UI can show what was actually used.
  async assetHoldersAtDate(asset: string, timestampSec: number, start = 0, offset = 50) {
    return this.authGet('/assets/' + asset + '/holders-at', { timestamp: timestampSec, start, offset });
  }

  async assetBalanceAt(asset: string, account: string, blockNumber: number) {
    return this.authGet('/assets/' + asset + '/balance-at', { account, blockNumber });
  }

  // Path B — register an issuer's pre-deployed BYO contract.
  async assetPreviewRegister(address: string) {
    return this.authGet('/assets/preview-register', { address });
  }

  /**
   * ⚠️ `formula` ADDED AT 4.9 and it is REQUIRED — the API 400s without it. Path B admits a
   * contract that already exists, so unlike the wizard there is no token to strand; but the
   * asset is just as governed, and the registry has no way to guess which of the regulator's
   * products it was issued under.
   */
  async assetRegisterExisting(address: string, formula: string) {
    return this.authPost('/assets/register-existing', { address, formula });
  }

  // ─── A8 registration lifecycle + A2 parties + A24 composition (Phase 15) ──────
  //
  // The ISSUER's half of getting an asset APPROVED. Until this shipped none of it was
  // reachable from any frontend: `registerAsset` lands an asset in approvalState 1 and
  // `isAssetTradable` requires approval, so nothing created here could ever trade.
  //
  // Everything is a LIVE chain read through the API — there is no mirror for the resolved
  // matrix, and the composition is editable right up until the regulator approves.

  /** Class, resolved 15-row matrix, composition (+frozen), derived roles, parties, declaration. */
  async assetClassInfo(address: string) {
    return this.authGet('/assets/' + address + '/class');
  }

  /** The requirement + party-role vocabularies. Static; drives the composition editor. */
  async assetClassCatalog() {
    return this.authGet('/asset-class/catalog');
  }

  // ─── Phase 4.9 — the regulator's class FORMULAS ────────────────────────────
  //
  // A formula is a contract the REGULATOR deployed and authored ("Green Sukuk",
  // "Conventional REIT") carrying the supply policy, price-mode policy, requirement rows,
  // permitted standards and parameters for one product. Since 4.9 the eleven asset classes
  // are BASE classes — mechanics vocabulary that decides nothing on its own — and asset
  // creation REQUIRES a formula with no default.
  //
  // ⚠️ So this list is what makes the Add-Asset wizard answerable at all. Without it the
  // only way to name a formula would be to paste a raw contract address, which an issuer
  // has no way to discover: there is no on-chain enumeration of a regulator's formulas
  // (the factory keeps no registry and the id IS the contract address).

  /**
   * Active class formulas an issuer may register under. `regulator` scopes to one
   * authority — a formula is only usable under the regulator that authored it, which is
   * the same rule `registerAsset` enforces on chain.
   */
  async assetClassFormulas(opts: { regulator?: string; baseClass?: number; state?: number | 'all' } = {}) {
    const params: Record<string, string> = {};
    if (opts.regulator) params['regulator'] = opts.regulator;
    if (opts.baseClass != null) params['baseClass'] = String(opts.baseClass);
    if (opts.state != null) params['state'] = String(opts.state);
    const data = await this.authGet('/asset-class-formulas', params);
    return data ? (data.formulas ?? []) : null;
  }

  /** One formula in full — header, the rows the regulator SET, named documents, standards, params. */
  async assetClassFormula(formula: string) {
    return this.authGet('/asset-class-formulas/' + formula);
  }

  /**
   * Candidates that may fill ONE asset role — what the party picker binds to. The server
   * has already applied both of `attachParty`'s refusals (right party class, and the
   * independence rule for every role but Servicer), so every row here is attachable.
   */
  async assetClassProviders(role: number) {
    return this.authGet('/asset-class/providers', { role: String(role) });
  }

  /** REPLACES the composition — send [] to clear. Class 11 only, refused once frozen. */
  async assetSetComposition(address: string, requirementIds: number[]) {
    return this.authPut('/assets/' + address + '/composition', { requirementIds });
  }

  // R16 — the asset's document-requirement picture, and the write that discharges one.
  //
  // 🔴 `customRows` COMES BACK UNCONDITIONALLY and is the half that matters: the regulator's own
  // named rows are born REQUIRED and reach the client through no other call, whereas catalog doc
  // rows 1..10 are usually unset. A caller cannot ask about a key it has never seen.
  //
  // ⚠️ `rowKeys` goes through `authGet`'s PARAMS argument, never concatenated onto the path.
  // Two reasons, and the second is the one that bit: CapacitorHttp encodes params properly, and
  // `check-vault-paths` matches path SEGMENTS — a query welded onto the last segment makes it
  // read as `requirement-documents<expr>`, which matches no route and is reported as a path
  // that will 404. The checker is right to say so; the string still type-checks.
  async assetRequirementDocuments(address: string, rowKeys: string[] = []) {
    return this.authGet('/assets/' + address + '/requirement-documents',
      rowKeys.length ? { rowKeys: rowKeys.join(',') } : undefined);
  }

  // ⚠️ Re-pointing a row WORKS (the contract does a plain assignment), so a wrong document is
  // corrected by declaring again. Only clear-to-zero is unavailable — zero IS the absence.
  async assetDeclareRequirementDocument(address: string, rowKey: string, documentId: number) {
    return this.authPost('/assets/' + address + '/requirement-documents', { rowKey, documentId });
  }

  /** The A8 declaration. Either half may be sent alone. */
  async assetSetDeclaration(address: string, body: { complianceProfile?: any; legalWrapperDocumentId?: number }) {
    return this.authPut('/assets/' + address + '/declaration', body);
  }

  /** Propose a class-required party. Lands PROPOSED — the party must accept for itself. */
  async assetPartyAttach(address: string, party: string, role: number) {
    return this.authPost('/assets/' + address + '/parties', { party, role });
  }

  /**
   * Works from ANY state, so it doubles as withdrawing a proposal nobody accepted.
   *
   * No `reason` argument on purpose. The route accepts one (body or query) but the Vault does
   * not collect it, and appending `?reason=…` by concatenation defeats `check-vault-paths.js` —
   * which reads these URLs literally and cannot prove a conditional suffix resolves to a real
   * route. A path that 404s at runtime is invisible to a production build, so keep these
   * literal.
   */
  async assetPartyRemove(address: string, party: string) {
    return this.authDelete('/assets/' + address + '/parties/' + party);
  }

  // ⚠️ The next two are deliberately NOT under `/assets/:address` — that prefix carries the
  // API's `requireOwnAsset` guard, and here THIS tenant is the provider consenting to a role
  // on someone else's asset, which is the normal case rather than the exception.

  /** Class info for an asset this tenant does NOT own — what a proposed provider reads. */
  async assetClassInfoForeign(asset: string) {
    return this.authGet('/asset-class/' + asset);
  }

  /** Consent to serve a role. `party` must be one of THIS entity's services. */
  async assetPartyAccept(asset: string, party: string) {
    return this.authPut('/asset-class/' + asset + '/parties/' + party + '/accept', {});
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

  // Per-service coverage aggregate: `{ service, minRatio, worstCurrency, totalShortfall,
  // breakdown: ServiceCoverageRow[] }` plus (Phase 31) the λ counts — `unsetCount` /
  // `assessedCount` / `status` on the service and on every breakdown row, each of which
  // carries its per-asset `assets[]` decomposition. Passed through; nothing is renamed.
  async vaultGetServicesCoverage(): Promise<ServiceCoverageAggregate[]> {
    const data = await this.vaultGet('/services/coverage');
    return (data?.services ?? []) as ServiceCoverageAggregate[];
  }

  // Returns the whole payload — the caller needs the regulator's shortfall alert tolerance
  // alongside the balances, not just the rows. Each balance row is a `ServiceCoverageRow`
  // (+ `balance` / `withheld` / `available` / `currencySymbol`) — see data.model.ts.
  async vaultGetServiceLiquidity(address: string): Promise<{
    balances: ServiceLiquidityRow[];
    shortfallTolerance: number | null;
    shortfallToleranceIsSet: boolean;
  }> {
    const data = await this.vaultGet('/services/' + address + '/liquidity');
    return {
      balances:  (data?.balances ?? []) as ServiceLiquidityRow[],
      shortfallTolerance:      data?.shortfallTolerance ?? null,
      shortfallToleranceIsSet: data?.shortfallToleranceIsSet ?? false,
    };
  }

  // An injection is a DEPOSIT whose beneficiary is the pool (S37/S78), so it names the transfer
  // that funded it and how well-evidenced that is. `evidence`: 2 = an independent supervised
  // participant stands behind the figure, 1 = a self-declaration on a manual rail; absent grades
  // DOWN to 1 server-side, because defaulting up asserts an attestation nobody made.
  async vaultServiceLiquidityInject(address: string, body: { currencyCode: number; amount: number; providerTrxRefNo: string; evidence?: 1 | 2 }) {
    return this.vaultPost('/services/' + address + '/liquidity/inject', body);
  }

  // ⚠️ `vaultServiceLiquidityWithdraw` is REMOVED, and there is nothing to point it at. The bare
  // pool drain has no on-chain call left: money leaves a service's pool through the WITHDRAWAL
  // LIFECYCLE (request → fulfil), which is queued, coverage-gated and evidenced. Calling the old
  // path would 404 — the route is gone on the API too.

  // Off-chain credit-ledger history for a service (plugin-mirrored). `origin='3,4'` = liquidity only.
  async vaultGetServiceCreditTransactions(
    address: string,
    opts: { origin?: string; currencyCode?: number; start?: number; offset?: number } = {},
  ) {
    const params: Record<string, string> = {
      start: String(opts.start ?? 0), offset: String(opts.offset ?? 100),
    };
    if (opts.origin) params['origin'] = opts.origin;
    if (opts.currencyCode != null) params['currencyCode'] = String(opts.currencyCode);
    const data = await this.vaultGet('/services/' + address + '/credit-transactions', params);
    return { count: data?.count ?? 0, transactions: data?.transactions ?? [] };
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

  // Custodian hold authority (2026-07-30) — this tenant acting AS a custodian.
  async vaultCustodyMandates(partyType?: number) {
    return this.vaultGet('/custody/mandates', partyType != null ? { partyType } : undefined);
  }
  async vaultCustodyAssets() {
    return this.vaultGet('/custody/assets');
  }
  async vaultCustodyAssetHolds(asset: string, start = 1, offset = 100) {
    return this.vaultGet(`/custody/assets/${asset}/holds`, { start, offset });
  }
  async vaultCustodyHoldPlace(body: { custodianService: string; asset: string; account: string; amount: string; reason?: string }) {
    return this.vaultPost('/custody/holds', body);
  }
  async vaultCustodyHoldRelease(asset: string, holdId: number, body: { custodianService: string; amount: string; reason?: string }) {
    return this.vaultPut(`/custody/holds/${asset}/${holdId}/release`, body);
  }

  // ─── Vault — State Change Logs ──────────────────────────────────────────────

  async vaultGetStateChangeLogs(address: string, start = 1, offset = 50) {
    return this.vaultGet(`/state-logs/${address}?start=${start}&offset=${offset}`);
  }
  async vaultGetAllStateChangeLogs(start = 1, offset = 50, type?: string, userId?: number, fromTs?: number, toTs?: number, action?: string) {
    let url = `/state-logs?start=${start}&offset=${offset}`;
    if (type) url += `&type=${type}`;
    if (userId) url += `&user_id=${userId}`;
    if (fromTs) url += `&from=${fromTs}`;
    if (toTs) url += `&to=${toTs}`;
    if (action) url += `&action=${encodeURIComponent(action)}`;
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

  /** Negotiated OTC — the desk's counterpart to vaultGetDexVolume's view of the book. */
  async vaultGetNegotiatedActivity(interval = '1d', points = 30) {
    const data = await this.vaultGet(`/analytics/negotiated-activity?interval=${encodeURIComponent(interval)}&points=${points}`);
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

  // ─── Vault — Asset writes ─────────────────────────────────────────────────────

  async vaultCreateAsset(body: Record<string, any>): Promise<{ type: string; error?: string; address?: string } | null> {
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/assets',
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
    const data = await this.vaultPut('/assets/' + address + '/state', { state, reason });
    return data ?? null;
  }

  // Fixed-supply only — mint/burn the asset's own treasury supply (manager-only on-chain).
  // `tokens` is a plain integer token count (not wei).
  async vaultMintAsset(address: string, tokens: number) {
    const data = await this.vaultPost('/assets/' + address + '/mint', { tokens });
    return data ?? null;
  }

  async vaultBurnAsset(address: string, tokens: number) {
    const data = await this.vaultPost('/assets/' + address + '/burn', { tokens });
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
    const data = await this.vaultPut('/assets/' + assetAddress + '/services/' + serviceAddress + '/state', { state, reason });
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

  async vaultUpdateServiceState(address: string, state: number, reason = '') {
    const data = await this.vaultPut('/services/' + address + '/state', { state, reason });
    return data ?? null;
  }

  async vaultSetServiceVisibility(address: string, visibility: number) {
    const data = await this.vaultPut('/services/' + address + '/visibility', { visibility });
    return data ?? null;
  }

  // Straight-through transactions: declares that on this service a cash-in IS a purchase of
  // units and a cash-out IS a redemption, unlocking creditDepositBuy / creditSellWithdraw.
  // The API writes it as a server-owned reserved key inside the service's ON-CHAIN metadata
  // (no contract change), so it comes back on the service row as `straightThrough`.
  async vaultSetServiceStraightThrough(address: string, enabled: boolean) {
    const data = await this.vaultPut('/services/' + address + '/straight-through', { enabled });
    return data ?? null;
  }

  // Service providers are 1:N. partyType is the SHARED platform numbering — the same ids as
  // `spType` on the curated set and as ServicePartiesLib's on-chain roles. The ids live in
  // PARTY_CLASS (shared/constants/party-class.ts); never restate them in a comment, which is
  // how this one came to describe the pre-split 1..4 numbering long after Bank took id 3.
  //
  // `escrowClearingHouses` is its own bucket, NOT folded into `clearingHouses`: the venue's
  // escrow CH is a separate appointment, and `_replaceServiceParty` detaches everything else
  // in the bucket it reads.

  async vaultGetServiceParties(address: string): Promise<ServiceParties | null> {
    const data = await this.vaultGet('/services/' + address + '/parties');
    return data ? {
      validators:           data.validators           ?? [],
      paymentProcessors:    data.paymentProcessors    ?? [],
      custodians:           data.custodians           ?? [],
      clearingHouses:       data.clearingHouses       ?? [],
      escrowClearingHouses: data.escrowClearingHouses ?? [],
    } : null;
  }

  // ── the onc/offc election (S5, S63-S68) ──────────────────────────────────────────────
  // Per (service, currency): 1 = onc, 2 = offc, 3 = migrating(from -> to). The ENTITY declares
  // the initial election and may WITHDRAW a pending request; only the REGULATOR approves a
  // SWITCH, in both directions — which is why there is no approve method here.
  async vaultServiceElection(address: string, currencyCode?: number) {
    const q = currencyCode ? '?currencyCode=' + currencyCode : '';
    return (await this.vaultGet('/services/' + address + '/election' + q)) ?? null;
  }
  // `vaultServiceElectionDeclare` was DELETED (2026-08-23). The ENTITY cannot declare an election:
  // `P_ELECTION_DECLARE` is gated `K_REGULATOR_OF`, so the SERVICE'S REGULATOR declares it, per
  // currency, from the Regulator Dashboard. The Entity API's route survives only to answer 410 with
  // an explanation. The entity may still REQUEST a switch — that is the next method down.
  async vaultServiceElectionRequestSwitch(address: string, currencyCode: number, target: number) {
    return (await this.vaultPost('/services/' + address + '/election/switch', { currencyCode, target })) ?? null;
  }
  async vaultServiceElectionWithdraw(address: string, currencyCode: number) {
    return (await this.vaultDelete('/services/' + address + '/election/switch?currencyCode=' + currencyCode)) ?? null;
  }
  // PERMISSIONLESS on chain (S68) — this only re-derives from authoritative state, so anyone may
  // drive it. Paginated: call until `complete`.
  async vaultServiceElectionMigrate(address: string, currencyCode: number, pageSize = 50) {
    return (await this.vaultPost('/services/' + address + '/election/migrate', { currencyCode, pageSize })) ?? null;
  }

  // ── per-currency payment attachments (S66, S67, S6) ──────────────────────────────────────
  // Distinct from /parties, which carries the currency-LESS roles. payRole: 1 = rail (offc),
  // 2 = minter (onc). The role is an ATTACHMENT-level fact — the same institution may be an
  // offc rail to one service and an onc minter to another — and it must equal the service's
  // election for that currency.
  async vaultServicePaymentProviders(address: string) {
    return (await this.vaultGet('/services/' + address + '/payment-providers')) ?? null;
  }
  async vaultAttachPaymentProvider(address: string, provider: string, currencyCode: number, payRole: number) {
    return (await this.vaultPost('/services/' + address + '/payment-providers', { provider, currencyCode, payRole })) ?? null;
  }
  async vaultDetachPaymentProvider(address: string, provider: string, currencyCode: number) {
    return (await this.vaultDelete('/services/' + address + '/payment-providers?provider=' + provider + '&currencyCode=' + currencyCode)) ?? null;
  }

  async vaultAttachServiceParty(address: string, partyType: number, party: string) {
    const data = await this.vaultPost('/services/' + address + '/parties', { partyType, party });
    return data ?? null;
  }

  async vaultDetachServiceParty(address: string, partyType: number, party: string) {
    const data = await this.vaultDelete('/services/' + address + '/parties?partyType=' + partyType + '&party=' + party);
    return data ?? null;
  }

  // Replace-over-1:N: make `party` the sole attached provider of `partyType` on the service.
  // Attaches the new one first (preserves the on-chain "type-1 keeps ≥1 custodian" invariant),
  // then detaches every other of that role. Backs the legacy single-provider "reassign" modals
  // until the multi-attach service-detail UI lands.
  private async _replaceServiceParty(address: string, partyType: number, party: string) {
    const parties = await this.vaultGetServiceParties(address);
    // ⚠️ Every role gets its OWN branch and there is deliberately NO fallback bucket. The
    // ids renumbered when the payment rail split into two TYPES (gateway 2 / bank 3), pushing
    // custodian to 4 and clearing house to 5; this map still read 4 as clearing-house, and a
    // `: parties?.custodians` default swallowed every unlisted id. So a clearing-house replace
    // detached the CUSTODIANS, and a bank replace did too — this helper DETACHES everything
    // else in the bucket it reads, so a wrong bucket is destructive, not merely empty.
    const BUCKET: Record<number, keyof ServiceParties> = {
      1: 'validators',
      2: 'paymentProcessors',   // the rail bucket collects gateway (2) AND bank (3)
      3: 'paymentProcessors',
      4: 'custodians',
      5: 'clearingHouses',
      6: 'escrowClearingHouses',
    };
    const bucket = BUCKET[partyType];
    if (!bucket) return { type: 'error', error: `unknown party class ${partyType}` };
    const current = parties?.[bucket];
    if (party) {
      const res = await this.vaultAttachServiceParty(address, partyType, party);
      if (res?.error) return res;
    }
    for (const c of (current ?? [])) {
      if (!party || c.address.toLowerCase() !== party.toLowerCase()) {
        await this.vaultDetachServiceParty(address, partyType, c.address);
      }
    }
    return { type: 'success' };
  }

  async vaultSetServiceValidator(address: string, validator: string) {
    return this._replaceServiceParty(address, PARTY_CLASS.VALIDATOR, validator);
  }

  async vaultSetServicePaymentProcessor(address: string, paymentProcessor: string) {
    return this._replaceServiceParty(address, PARTY_CLASS.PAYMENT_GATEWAY, paymentProcessor);
  }

  // ⚠️ Was `3` — which is now BANK. This sent every custodian reassignment to the wrong class.
  async vaultSetServiceCustodian(address: string, custodian: string) {
    return this._replaceServiceParty(address, PARTY_CLASS.CUSTODIAN, custodian);
  }

  // ─── Vault — Validators & Payment Processors ─────────────────────────────────

  // The three per-type picker endpoints were merged into one parameterized route. These
  // keep their names + return shapes so no call site changed. NOTE this is the
  // regulator-offered CANDIDATE list (live chain), not `vaultGetServiceProviders()` below,
  // which is the entity's own registered providers (mirror) — different sets, hence the
  // `/available` sub-path rather than a `?type=` on the same endpoint.
  private async vaultGetProvidersAvailable(type: 'validator' | 'payment-processor' | 'custodian' | 'clearing-house', start = 1, offset = 50) {
    return await this.vaultGet('/service-providers/available', { type, start, offset });
  }

  async vaultGetValidators(start = 1, offset = 50) {
    const data = await this.vaultGetProvidersAvailable('validator', start, offset);
    return data ? { count: data.count, validators: data.providers } : null;
  }

  async vaultGetPaymentProcessors(start = 1, offset = 50) {
    const data = await this.vaultGetProvidersAvailable('payment-processor', start, offset);
    return data ? { count: data.count, paymentProcessors: data.providers } : null;
  }

  // `regulatorAddress` is accepted for call-site compatibility but no longer sent — the Entity API's
  // /vault/custodians derives the entity's own regulator server-side and merges owned + endorsed,
  // mirroring /validators and /payment-processors. (The old /regulators/:addr/custodians/endorsed
  // route never existed, so the picker always came back empty.)
  async vaultGetEndorsedCustodians(_regulatorAddress: string, start = 1, offset = 50) {
    const data = await this.vaultGetProvidersAvailable('custodian', start, offset);
    return data ? { count: data.count, custodians: data.providers } : null;
  }

  // Clearing houses (CCPs) — party type 5, the same id used to curate AND to attach.
  async vaultGetClearingHouses(start = 1, offset = 50) {
    const data = await this.vaultGetProvidersAvailable('clearing-house', start, offset);
    return data ? { count: data.count, clearingHouses: data.providers } : null;
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
    const data = await this.vaultPut('/subscriptions/' + address + '/state', { state, reason });
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
    return data ? { totals: data.totals, pools: data.pools, subscriptions: data.subscriptions } : null;
  }

  async vaultGetSubscriptionIdentityHash(address: string) {
    const data = await this.vaultGet('/subscriptions/' + address + '/identity-hash');
    return data?.identityHash ?? null;
  }

  // ─── eKYC doc-first reads (own-originated verifications — unified-eKYC §2.4) ────
  // The entity re-reads exactly the identity data IT originated; foreign-originated
  // verifications are unreadable by construction (per-doc DEK wrap). All three are
  // gated server-side by the `view-documents` system function.

  async ekycVerifications(didHash: string) {
    const data = await this.authGet('/ekyc/verifications', { didHash });
    return data?.verifications ?? [];
  }

  async ekycTransaction(transactionId: string, didHash?: string) {
    return this.authGet('/ekyc/transaction', { transactionId, ...(didHash ? { didHash } : {}) });
  }

  async ekycImages(transactionId: string, didHash?: string) {
    return this.authGet('/ekyc/images', { transactionId, ...(didHash ? { didHash } : {}) });
  }

  /*
      Regulator-issued identity DISCLOSURE for one subscriber at one of our services (Phase
      22.10). The regulator availed the service named field families and encrypted exactly those
      for it; this reads the projection back. Same `view-identity-data` gate as `/ekyc/*`.

      ⚠️ NOT through `authGet`, on purpose: that helper collapses every non-2xx to null, and here
      404 and 502 are DIFFERENT FACTS the page must show differently — "nothing has been availed"
      versus "something was availed and will not open" send an operator to different places.
  */
  async disclosureRead(subscription: string): Promise<{ status: number; data: IdentityDisclosure | null; error?: string }> {
    try {
      // Keyed by the SUBSCRIPTION: an entity cannot resolve a subscription to a DID hash (the
      // chain gate is regulator-only by design), so the projection is addressed by the one key
      // this tenant holds. The API derives the service from its own subscriptions mirror.
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + '/disclosures/' + subscription,
        headers: { 'Content-Type': 'application/json', ...(await this.authHeader()), ...this.getAuditHeaders() },
      });
      if (response.status === 401) { this._handleAuthFailure(); return { status: 401, data: null }; }
      if (response.status >= 300) return { status: response.status, data: null, error: response.data?.error };
      return { status: response.status, data: response.data as IdentityDisclosure };
    } catch {
      return { status: 0, data: null };
    }
  }

  // ─── Vault — Users ────────────────────────────────────────────────────────────

  async vaultGetUsers(start = 0, offset = 50) {
    const data = await this.vaultGet('/staff', { start, offset });
    return data ? { count: data.count, users: data.users } : null;
  }

  async vaultGetUser(id: string) {
    const data = await this.vaultGet('/staff/' + id);
    return data?.user ?? null;
  }

  async vaultGetUserDefaultKey(id: string | number) {
    const data = await this.vaultGet('/staff/' + id + '/default-key');
    return data ? { address: data.address as string | null, keyId: data.keyId as number | null } : null;
  }

  async vaultCreateUser(body: Record<string, any>) {
    const data = await this.vaultPost('/staff', body);
    return data ?? null;
  }

  async vaultUpdateUserData(id: string, body: Record<string, any>) {
    const data = await this.vaultPut('/staff/' + id + '/data', body);
    return data ?? null;
  }

  async vaultUpdateUserState(id: string, state: number) {
    const data = await this.vaultPut('/staff/' + id + '/state', { state });
    return data ?? null;
  }

  async vaultUpdateUserRole(id: string, role: number) {
    const data = await this.vaultPut('/staff/' + id + '/role', { role });
    return data ?? null;
  }

  // 18.5 — HASHES ONLY: `{ commitment, salt }` derived in the browser over the target's CURRENT
  // username (EthersService.deriveCredential); the API rejects a `password` field.
  async vaultUpdateUserPassword(id: string, body: { commitment: string; salt: string }) {
    const data = await this.vaultPut('/staff/' + id + '/password', body);
    return data ?? null;
  }

  async vaultUpdateUserCredentials(id: string, body: Record<string, any>) {
    const data = await this.vaultPut('/staff/' + id + '/credentials', body);
    return data ?? null;
  }

  // Self-service password change (My Profile) — verifies the caller's current password
  // server-side before rotating (password-only; keeps the username).
  // 18.2 — PROOF-VERIFIED: a Groth16 login proof over the CURRENT credentials + the NEW tuple.
  // The response carries `reloginRequired: true` — the contract revoked the session.
  async vaultUserSelfCredentials(id: string, body: { proof: { a: string[]; b: string[][]; c: string[]; input: string[] }; commitment: string; salt: string }) {
    const data = await this.vaultPut('/staff/' + id + '/self-credentials', body);
    return data ?? null;
  }

  // ─── Vault — Reference data ───────────────────────────────────────────────────

  // `/services/own` was removed from the API — its handler was byte-identical to the
  // plain list (one Entity API serves one tenant, so every mirrored service IS its own).
  // Kept as a named method because call sites read better with the intent spelled out.
  // NOTE: `start` is a 0-based SQL OFFSET here, not the contracts' 1-based `start`.
  async vaultGetServicesOwn(start = 0, offset = 50) {
    const data = await this.vaultGet('/services', { start, offset });
    return data ? { count: data.count, services: data.services } : null;
  }

  // provider (the payment-processor service that ran the transaction) + providerTrxRefNo are
  // required — a service may have multiple PPs, so the caller picks one (must be attached) and
  // supplies the SP's transaction reference. `raw` is the optional unprocessed SP result,
  // pinned as an encrypted receipt document; providerTrxTime backdates the ledger row.
  async creditDeposit(body: { service: string; provider: string; providerName?: string; subscriber: string; currencyCode: number; amount: number; providerTrxRefNo: string; providerTrxTime?: number; raw?: any }): Promise<{ result?: any; error?: string }> {
    return this._creditMutation('/credit/deposit', body);
  }

  async creditWithdraw(body: { service: string; provider: string; providerName?: string; subscriber: string; currencyCode: number; amount: number; providerTrxRefNo: string; providerTrxTime?: number; raw?: any }): Promise<{ result?: any; error?: string }> {
    return this._creditMutation('/credit/withdraw', body);
  }

  // ─── straight-through combined verbs (Phase 21) ───────────────────────────
  //
  // Available only on a service with `straightThrough` on (409 otherwise). Both are API
  // orchestration over the two existing on-chain paths, so they answer 200 with a PARTIAL
  // result when the second leg fails after the first has mined — the callers below MUST check
  // `buyError` / `withdrawError` on a successful response rather than treating a 200 as "both
  // legs done". Reporting a partial as a failure would be worse than useless: the money has
  // already moved and a retry would move it twice.

  // Cash in, units out. `amount` is the deposit AND, by default, the buy budget.
  async creditDepositBuy(body: { service: string; provider: string; providerName?: string; subscriber: string; currencyCode: number; amount: number; providerTrxRefNo: string; providerTrxTime?: number; raw?: any; asset: string; tokens?: number; value?: number; price?: number }): Promise<{ result?: any; buyError?: string; error?: string }> {
    return this._creditMutation('/credit/deposit-buy', body);
  }

  // Units in, cash-out REQUEST opened. It does NOT pay out — fulfilment stays the existing
  // async withdrawal-request lifecycle.
  async creditSellWithdraw(body: { service: string; subscriber: string; asset: string; tokens?: number; value?: number; price?: number; instrument: string; minterOfRecord?: string; providerTrxRefNo: string; amount?: number }): Promise<{ result?: any; withdrawError?: string; error?: string }> {
    return this._creditMutation('/credit/sell-withdraw', body);
  }

  // Bank hub move — the entity's Bank-level PP `service` moves an identity's credit between its
  // bank-account hub and a spoke subscription (both same identity, enforced on-chain).
  // providerTrxRefNo (the SP's external transaction reference) is required; providerTrxTime
  // (unix seconds) optionally backdates the ledger row; `raw` is pinned as an encrypted IPFS
  // receipt document.
  // ⚠️ The bank-transfer client method is REMOVED. `/credit/bank-transfer` folded into
  // `/credit/route-transfer` — one same-identity primitive that names the destination SERVICE
  // and resolves the subscription server-side, so the subscriber's DID never reaches a service
  // that only needs to know the same person banks elsewhere. Calling the old path would 404.

  // Anonymous service-routed move — the entity's source `service` routes `fromSub`'s credit to the
  // SAME identity's subscription at `destinationService` (resolved on-chain; the sibling sub + DID are never exposed).
  async routeTransfer(body: { service: string; fromSub: string; destinationService: string; currencyCode: number; amount: number; providerTrxRefNo: string; providerTrxTime?: number; raw?: any }): Promise<{ result?: any; requestId?: string; approvalState?: number; error?: string }> {
    return this._creditMutation('/credit/route-transfer', body);
  }

  private async _creditMutation(path: string, body: Record<string, any>): Promise<{ result?: any; requestId?: string; approvalState?: number; buyError?: string; withdrawError?: string; error?: string }> {
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
      // `buyError` / `withdrawError` ride a 200 on the straight-through combined verbs: leg 1
      // mined and leg 2 did not. They MUST be forwarded — dropping them here would turn a
      // partial into a silent full success, which is the one outcome that misreports money.
      return { result: response.data?.result, requestId: response.data?.requestId, approvalState: response.data?.approvalState,
               buyError: response.data?.buyError, withdrawError: response.data?.withdrawError };
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

  // mode 'did' = returning claimed user by DID hash; 'new' = new/unclaimed identity from a
  // caller-supplied canonical eKYC result (the ekyc envelope — the API never calls a provider).
  async usersOnboard(body: Record<string, any>, mode: 'did' | 'new'): Promise<{ subscriptionAddress?: string; error?: string }> {
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/subscribers/onboard/' + mode,
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

  // Reference data lives once, under /vault/global/*. These three kept their names and
  // return shapes so no call site changed, but they now delegate to the canonical
  // endpoints — the /vault/countries + /vault/global-variables twins they used to hit
  // were removed as strict subsets (no ?search=, no ?visible=, no count).
  async vaultGetCountries() {
    return (await this.vaultGetGlobalCountries())?.countries ?? null;
  }

  async vaultGetGlobalVariables() {
    return (await this.vaultGetGlobalVariablesList())?.variables ?? null;
  }

  async vaultGetGlobalVariablesByCategory(category: string) {
    return (await this.vaultGetGlobalVariablesList(category))?.variables ?? null;
  }

  /*
      SERVICE LICENSES (Phase 28) — the entity's view of what its own services are permitted to do.

      🔴 THESE ROUTES HAVE EXISTED ALL ALONG AND HAD NO CALLER. `service.licenses` on the model was
      therefore permanently `[]`, and the Licences box on the service detail rendered "—" in two
      places — which is precisely what the user reported as *"on the entity side, the granted
      license is not reflected"*. It was never missing plumbing: it was an unpopulated field, the
      same defect the Regulator Dashboard carried, in the same shape, in the second app.

      ⚠️ Each row carries `active`, taken from `hasLicense` — the chain's own predicate — and that
      is what decides capability. `state` says what HAPPENED; `active` says what the service MAY DO.
      `licensesOf` deliberately returns Denied and Revoked rows too, so a consumer that reads
      `state` alone can publish a revoked licence as though it were held.
  */
  async vaultGetServiceLicenses(address: string) {
    return this.vaultGet('/services/' + address + '/licenses');
  }
  /**
   * Phase 17 FUNCTION GRANTS for one service — READ ONLY.
   *
   * ⚠️ There is deliberately no companion setter. A grant is the REGULATOR's act; an entity that
   * could widen its own grants would make the model decorative. Do not add one here.
   *
   * Returns EVERY catalog row addressed to a service, not only the granted ones — Phase 17 is
   * default-deny, so the rows a service does NOT hold are the more informative half.
   */
  async vaultGetServiceGrants(address: string) {
    return this.vaultGet('/services/' + address + '/grants');
  }

  /** Apply for a license. It confers NOTHING until the regulator approves — it lands Requested. */
  async vaultRequestServiceLicense(address: string, classId: number, countryCode: number) {
    return this.vaultPost('/services/' + address + '/licenses', { classId, countryCode });
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
        url: this.apiURL + '/entity/login',
        headers: { 'Content-Type': 'application/json' },
        data: { ...rest, privateKey: key.privateKey },
      });
      // ⚠️ TWO-STEP SIGN-IN FORK. With LOGIN_MFA_ENABLED the API answers `type: 'success'` with
      // `mfaRequired: true` and **no token** — the password is proven, the session withheld until
      // a code is verified.
      //
      // ⚠️ `success: false` IS DELIBERATE, and is the fail-safe choice. Tested BEFORE the success
      // branch so an un-updated caller that checks only `success` treats this as a failed login,
      // rather than proceeding with `token: undefined` — which is exactly what the previous shape
      // would have produced: an apparently-successful sign-in whose every later request is
      // unauthenticated. A caller that understands the flow checks `mfaRequired` first.
      if (response.data?.mfaRequired) {
        return {
          success: false,
          mfaRequired: true,
          mfaToken: response.data.mfaToken,
          expiresInMinutes: response.data.expiresInMinutes,
          key,
        };
      }
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

  /**
   * Step two of a two-step sign-in: exchange the half-session + emailed code for a real session.
   *
   * ⚠️ The `key` from step one must be carried by the CALLER and passed to whatever consumes the
   * session — this call does not regenerate it. Step one produced the ephemeral signer and proved
   * the password; this only completes the exchange.
   */
  async entityLoginMfa(mfaToken: string, code: string) {
    try {
      const response = await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/entity/login/mfa',
        headers: { 'Content-Type': 'application/json' },
        data: { mfaToken, code },
      });
      if (response.data?.type === 'success') {
        return {
          success: true,
          userId: response.data.userId,
          token: response.data.token,
          expiresAt: response.data.expiresAt,
          refreshExpiresAt: response.data.refreshExpiresAt,
        };
      }
      // `attemptsRemaining` is surfaced so the UI can tell the user a wrong code costs them
      // something — after three the challenge is destroyed and they start again.
      return {
        success: false,
        error: response.data?.error || 'Verification failed',
        attemptsRemaining: response.data?.attemptsRemaining,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Verification failed' };
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
        url: this.apiURL + '/staff/claim-status?loginHash=' + encodeURIComponent(loginHash),
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.data?.type === 'success') return response.data.status;
      return null;
    } catch { return null; }
  }

  // Fetch a user's { nonce, commitment } by loginHash so the ZK login circuit input can be built
  // without a direct RPC read. PUBLIC endpoint — called pre-login (no JWT yet), same as claim-status.
  // 18.B4: `salt` is the credential's own stored salt (the Argon2id input). 18.B3: an unknown
  // loginHash gets a stable decoy tuple, never a 4xx — the proof then fails on chain.
  async vaultUserCredentialsData(loginHash: string): Promise<{ nonce: string; commitment: string; salt: string } | null> {
    try {
      const response = await CapacitorHttp.request({
        method: 'GET',
        url: this.apiURL + '/staff/credentials-data?loginHash=' + encodeURIComponent(loginHash),
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.data?.type === 'success') return response.data.credentials;
      return null;
    } catch { return null; }
  }

  // Submit the claim transaction. Must be called immediately after a successful login with the
  // placeholder commitment — the just-established admin session is what authenticates the call
  // on chain (contract enforces authorizedUser[msg.sender] == 1).
  // 18.B4: the claim stores the admin's own freshly minted `newSalt` beside the new commitment
  // (the placeholder was committed under the regulator's bootstrap salt).
  async vaultUserAdminClaim(newCommitment: string, newSalt: string, profile?: { name: string; username: string; email: string }) {
    const data = await this.vaultPost('/staff/admin-claim', { newCommitment, newSalt, ...(profile || {}) });
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
        url: this.apiURL + '/identity/credentials-data?identityAddress=' + encodeURIComponent(identityAddress),
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

  // Identifiers bound to the entity's own DID (LEI, commercial registry, tax id …).
  // Each row carries BOTH the readable value and the on-chain hash, plus `matches` —
  // see the API's GET /entity/identifiers for why the two can disagree.
  async vaultGetEntityIdentifiers() {
    const data = await this.vaultGet('/entity/identifiers');
    return data?.identifiers ?? [];
  }

  async vaultUpdateEntityIdentifier(body: { idType: number; value: string; reason?: string }) {
    const data = await this.vaultPut('/entity/identifiers', body);
    return data ?? null;
  }

  async vaultUpdateAssetMetadata(address: string, metadata: Record<string, any>) {
    const data = await this.vaultPut('/assets/' + address + '/metadata', { metadata });
    return data ?? null;
  }

  // Security identifiers (ISIN, …) live under the SERVER-OWNED `identifiers` key inside the
  // same metadata blob, so these two are its only writers — vaultUpdateAssetMetadata above
  // carries the existing value forward and never accepts one from the client.
  async vaultSetAssetIdentifier(address: string, body: { idType: number; value: string }) {
    const data = await this.vaultPut('/assets/' + address + '/identifiers', body);
    return data ?? null;
  }

  async vaultRemoveAssetIdentifier(address: string, idType: number) {
    const data = await this.vaultDelete('/assets/' + address + '/identifiers/' + idType);
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
  // Hard ceiling on a multipart upload. The document write path pins to IPFS and then waits
  // for an on-chain receipt; the API bounds that wait at 120s, so anything past this is a
  // request that will never be answered (e.g. a relay tx dropped from the tx pool). Without
  // it the XHR promise never settles and the upload spinner runs forever with no error.
  private readonly UPLOAD_TIMEOUT_MS = 180000;

  // Generic multipart POST for non-document endpoints (e.g. settlement confirm-sent's
  // optional wire receipt). Flat string fields + one optional file under `fileField`.
  private async _postMultipartFields(
    path: string,
    fields: Record<string, string>,
    file: File | null,
    fileField: string,
  ): Promise<any> {
    const token = await this.sessionService.getActiveToken();
    if (!token) {
      this._handleAuthFailure();
      return { error: 'Session expired. Please log in again.', status: 401 };
    }
    return new Promise<any>((resolve) => {
      try {
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) form.append(k, v);
        if (file) form.append(fileField, file, file.name);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', this.apiURL + path);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        const audit = this.getAuditHeaders();
        for (const [k, v] of Object.entries(audit)) xhr.setRequestHeader(k, v);

        xhr.onload = () => {
          let json: any = null;
          try { json = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* non-JSON body */ }
          if (xhr.status === 401) {
            this._handleAuthFailure();
            resolve({ error: 'Session expired. Please log in again.', status: 401 });
            return;
          }
          if (xhr.status >= 300 || json?.error) {
            resolve({ error: json?.error || json?.message || `Request failed (HTTP ${xhr.status})`, status: xhr.status });
            return;
          }
          resolve(json ?? { ok: true });
        };
        xhr.onerror = () => resolve({ error: 'Network error', status: 0 });
        xhr.onabort = () => resolve({ error: 'Request aborted', status: 0 });
        xhr.timeout = this.UPLOAD_TIMEOUT_MS;
        xhr.ontimeout = () => resolve({ error: 'Request timed out — the server did not respond.', status: 0 });
        xhr.send(form);
      } catch (e: any) {
        resolve({ error: e?.message || 'Request failed', status: 0 });
      }
    });
  }

  private async _uploadMultipart(
    path: string,
    file: File,
    metadata: { title?: string; description?: string; fileType?: string; documentType: number; documentState: number; sharedWith?: string[]; imageRole?: string },
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
        if (metadata.imageRole) form.append('imageRole', metadata.imageRole);

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
        xhr.timeout = this.UPLOAD_TIMEOUT_MS;
        xhr.ontimeout = () => resolve({ error: 'Upload timed out — the server did not respond. The file may not have been saved.', status: 0 });
        xhr.send(form);
      } catch (e: any) {
        resolve({ error: e?.message || 'Upload failed', status: 0 });
      }
    });
  }

  // PUT-multipart sibling of _uploadMultipart, for replacing a document's file. Separate method
  // rather than a flag on the uploader because the body shape differs: no documentType /
  // documentState / sharedWith (the API preserves the document's type, state and ACL).
  private async _replaceFileMultipart(
    path: string,
    file: File,
    metadata: { title?: string; description?: string; fileType?: string } = {},
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

        const xhr = new XMLHttpRequest();
        xhr.open('PUT', this.apiURL + path);
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
            resolve({ error: json?.error || json?.message || `Replace failed (HTTP ${xhr.status})`, status: xhr.status });
            return;
          }
          resolve(json ?? { ok: true });
        };
        xhr.onerror = () => resolve({ error: 'Network error', status: 0 });
        xhr.onabort = () => resolve({ error: 'Upload aborted', status: 0 });
        xhr.timeout = this.UPLOAD_TIMEOUT_MS;
        xhr.ontimeout = () => resolve({ error: 'Replace timed out — the server did not respond. The file may not have been replaced.', status: 0 });
        xhr.send(form);
      } catch (e: any) {
        resolve({ error: e?.message || 'Replace failed', status: 0 });
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
    metadata: { title?: string; description?: string; fileType?: string; documentType: number; documentState: number; sharedWith?: string[]; imageRole?: string },
    onProgress?: (percent: number) => void,
  ) {
    return this._uploadMultipart('/documents', file, metadata, onProgress);
  }
  // Media role on an existing public entity image ('avatar' | 'banner' | 'gallery' = unset).
  async vaultSetEntityMediaRole(id: any, role: string) {
    return await this.authPut('/documents/' + id + '/media-role', { role });
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
  // Signatures + review state on an inbound shared doc (recipient-relaxed signature reads).
  async documentSharedSignatures(owner: string, id: any, start = 1, offset = 50) {
    return await this.authGet('/documents/shared/' + owner + '/' + id + '/signatures', { start: String(start), offset: String(offset) });
  }

  // Replace a document's file: new DEK, re-wrapped for the current ACL, new CID → new version.
  async documentReplaceFile(
    id: any,
    file: File,
    metadata: { title?: string; description?: string; fileType?: string } = {},
    onProgress?: (percent: number) => void
  ) {
    return this._replaceFileMultipart('/documents/' + id, file, metadata, onProgress);
  }

  // Upload ledger — every CID a document has ever pointed at (newest first).
  async documentVersions(id: any, start = 1, offset = 50) {
    return await this.authGet('/documents/' + id + '/versions', { start: String(start), offset: String(offset) });
  }
  async documentSharedVersions(owner: string, id: any, start = 1, offset = 50) {
    return await this.authGet('/documents/shared/' + owner + '/' + id + '/versions', { start: String(start), offset: String(offset) });
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
  /** The service document that points at `cid` — how a credit row's SP receipt is reached now
   *  that the plain list drops receipts (2026-09-09). 404 when nothing carries the CID. */
  async serviceDocumentByCid(address: string, cid: string) {
    return await this.authGet('/services/' + address + '/documents/by-cid/' + encodeURIComponent(cid));
  }
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
  async serviceDocumentVersions(address: string, id: any, start = 1, offset = 50) {
    return await this.authGet('/services/' + address + '/documents/' + id + '/versions', { start: String(start), offset: String(offset) });
  }
  async serviceDocumentSign(address: string, id: any, keyId: any, docHash: string) {
    return await this.authPost('/services/' + address + '/documents/' + id + '/sign', { keyId, docHash });
  }
  async serviceDocumentAddMultipart(
    address: string, file: File,
    metadata: { title?: string; description?: string; fileType?: string; documentType: number; documentState: number; sharedWith?: string[]; imageRole?: string },
    onProgress?: (percent: number) => void,
  ) {
    return this._uploadMultipart('/services/' + address + '/documents', file, metadata, onProgress);
  }
  // Media role on an existing public service image ('avatar' | 'banner' | 'gallery' = unset).
  async vaultSetServiceMediaRole(address: string, id: any, role: string) {
    return await this.authPut('/services/' + address + '/documents/' + id + '/media-role', { role });
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
  async assetDocumentVersions(address: string, id: any, start = 1, offset = 50) {
    return await this.authGet('/assets/' + address + '/documents/' + id + '/versions', { start: String(start), offset: String(offset) });
  }
  async assetDocumentSign(address: string, id: any, keyId: any, docHash: string) {
    return await this.authPost('/assets/' + address + '/documents/' + id + '/sign', { keyId, docHash });
  }
  async assetDocumentAddMultipart(
    address: string, file: File,
    metadata: { title?: string; description?: string; fileType?: string; documentType: number; documentState: number; sharedWith?: string[]; imageRole?: string },
    onProgress?: (percent: number) => void,
  ) {
    return this._uploadMultipart('/assets/' + address + '/documents', file, metadata, onProgress);
  }
  // Media role on an existing public asset image ('avatar' | 'banner' | 'gallery' = unset).
  async vaultSetAssetMediaRole(address: string, id: any, role: string) {
    return await this.authPut('/assets/' + address + '/documents/' + id + '/media-role', { role });
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
  async subscriptionDocumentVersions(address: string, id: any, start = 1, offset = 50) {
    return await this.authGet('/subscriptions/' + address + '/documents/' + id + '/versions', { start: String(start), offset: String(offset) });
  }
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
        xhr.timeout = this.UPLOAD_TIMEOUT_MS;
        xhr.ontimeout = () => resolve(null);
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

  // `category` omitted ⇒ every variable (what the removed /vault/global-variables served).
  // `visible` only narrows a category listing, so the API 400s it without one.
  async vaultGetGlobalVariablesList(category?: string, visibleOnly?: boolean) {
    const params: Record<string, any> = {};
    if (category) params['category'] = category;
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

  // ─── Activity Logs ──────────────────────────────────────────────────────────

  async vaultPostActivityLog(body: Record<string, any>) {
    try {
      await CapacitorHttp.request({
        method: 'POST',
        url: this.apiURL + '/logs/activity',
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
        url: this.apiURL + '/logs/audit',
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
    return this.authGet('/audit/' + encodeURIComponent(String(id)));
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

  async vaultGetActivityLogs(start = 1, offset = 50, category?: string, userId?: number, fromTs?: number, toTs?: number, action?: string) {
    const params: Record<string, any> = { start: String(start), offset: String(offset) };
    if (category) params['category'] = category;
    if (userId) params['user_id'] = String(userId);
    if (fromTs) params['from'] = String(fromTs);
    if (toTs) params['to'] = String(toTs);
    if (action) params['action'] = action;
    return this.vaultGet('/logs/activity', params);
  }

  // ─── Connect (messaging) ──────────────────────────────────────────────────
  async connectInboxRegister()                       { return this.vaultPost('/connect/inbox/register', {}); }
  async connectInboxInfo()                           { return this.vaultGet ('/connect/inbox'); }
  async connectInboxSetDND(enabled: boolean)         { return this.vaultPost('/connect/inbox/dnd', { enabled }); }
  async connectInboxBlock(counterparty: string)      { return this.vaultPost('/connect/inbox/block', { counterparty }); }
  async connectInboxUnblock(addr: string)            { return this.vaultDelete('/connect/inbox/block/' + addr); }

  async connectThreadsList(start = 1, offset = 50)   { return this.vaultGet (`/connect/threads?start=${start}&offset=${offset}`); }
  async connectThreadCreate(body: any)               { return this.vaultPost('/connect/threads', body); }
  // Multipart create — used when the initial message carries attachments (≤10
  // files, encrypted server-side). `body` holds { kind, subject?, targets[],
  // initialMessage:{ text, contentType?, to? } }; only files ride as binary.
  async connectThreadCreateMultipart(body: any, files: File[], onProgress?: (percent: number) => void): Promise<any> {
    const token = await this.sessionService.getActiveToken();
    if (!token) {
      this._handleAuthFailure();
      return { error: 'Session expired. Please log in again.', status: 401 };
    }
    return new Promise<any>((resolve) => {
      try {
        const form = new FormData();
        for (const f of files || []) form.append('attachments', f, f.name);
        form.append('kind', body.kind);
        if (body.subject) form.append('subject', body.subject);
        form.append('targets', JSON.stringify(body.targets || []));
        if (body.initialMessage) form.append('initialMessage', JSON.stringify(body.initialMessage));

        const xhr = new XMLHttpRequest();
        xhr.open('POST', this.apiURL + '/connect/threads');
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        const audit = this.getAuditHeaders();
        for (const [k, v] of Object.entries(audit)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => {
          if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { resolve({ error: 'Invalid response', status: xhr.status }); }
        };
        xhr.onerror = () => resolve({ error: 'Network error', status: 0 });
        xhr.timeout = this.UPLOAD_TIMEOUT_MS;
        xhr.ontimeout = () => resolve({ error: 'Timed out — the server did not respond.', status: 0 });
        xhr.send(form);
      } catch (err: any) {
        resolve({ error: err?.message || 'upload failed', status: 0 });
      }
    });
  }
  async connectThreadGet(id: number)                 { return this.vaultGet ('/connect/threads/' + id); }
  async connectThreadClose(id: number, reason = '')  { return this.vaultPost(`/connect/threads/${id}/close`, { reason }); }
  async connectThreadBroadcast(id: number, text: string, contentType = 4, subject?: string) {
    return this.vaultPost(`/connect/threads/${id}/broadcast`, { text, contentType, subject });
  }

  // Connect v2 — participant mutation (any participant may add; creator or the
  // country regulator removes; anyone but the creator may leave). Adding ALWAYS
  // shares the thread history this tenant can decrypt with the newcomers.
  async connectThreadAddParticipants(id: number, targets: any[]) {
    return this.vaultPost(`/connect/threads/${id}/participants`, { targets });
  }
  async connectThreadRemoveParticipant(id: number, address: string, reason = '') {
    return this.vaultDelete(`/connect/threads/${id}/participants/${address}`);
  }
  async connectThreadLeave(id: number) {
    return this.vaultPost(`/connect/threads/${id}/leave`, {});
  }

  async connectMessagesList(threadId: number, start = 1, offset = 100) {
    return this.vaultGet(`/connect/threads/${threadId}/messages?start=${start}&offset=${offset}`);
  }
  // Connect v2 send: ONE row addressed to to[] — bare addresses, {party, userId?},
  // "alice@partyName" handle strings, or {subscriptionAddr}. Empty/omitted to = reply-all.
  async connectMessageSend(threadId: number, body: { to?: any[]; text: string; subject?: string; contentType?: number }) {
    return this.vaultPost(`/connect/threads/${threadId}/messages`, body);
  }
  // Multipart variant when attachments ride along (≤10 files, encrypted with the
  // same per-message DEK server-side).
  async connectMessageSendMultipart(
    threadId: number,
    body: { to?: any[]; text: string; subject?: string; contentType?: number },
    files: File[],
    onProgress?: (percent: number) => void,
  ): Promise<any> {
    const token = await this.sessionService.getActiveToken();
    if (!token) {
      this._handleAuthFailure();
      return { error: 'Session expired. Please log in again.', status: 401 };
    }
    return new Promise<any>((resolve) => {
      try {
        const form = new FormData();
        for (const f of files || []) form.append('attachments', f, f.name);
        form.append('text', body.text);
        if (body.subject) form.append('subject', body.subject);
        if (body.contentType != null) form.append('contentType', String(body.contentType));
        if (body.to && body.to.length) form.append('to', JSON.stringify(body.to));

        const xhr = new XMLHttpRequest();
        xhr.open('POST', this.apiURL + `/vault/connect/threads/${threadId}/messages`);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        const audit = this.getAuditHeaders();
        for (const [k, v] of Object.entries(audit)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => {
          if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { resolve({ error: 'Invalid response', status: xhr.status }); }
        };
        xhr.onerror = () => resolve({ error: 'Network error', status: 0 });
        xhr.timeout = this.UPLOAD_TIMEOUT_MS;
        xhr.ontimeout = () => resolve({ error: 'Timed out — the server did not respond.', status: 0 });
        xhr.send(form);
      } catch (err: any) {
        resolve({ error: err?.message || 'upload failed', status: 0 });
      }
    });
  }
  // Message-scoped decrypted content (DM-visibility-gated server-side).
  async connectMessageContentById(id: number) {
    return this.vaultGet(`/connect/messages/${id}/content`);
  }
  // Attachment blob URL (decrypted server-side after the visibility gate).
  // _fetchFileBlob paths are apiURL-relative — the /vault prefix must be explicit.
  async connectMessageAttachment(id: number, idx: number) {
    return this._fetchFileBlob(`/vault/connect/messages/${id}/attachments/${idx}`);
  }
  // Legacy raw-cid fetch — thread metadataCid only (message cids 403).
  async connectMessageContent(cid: string) {
    return this.vaultGet('/connect/content/' + encodeURIComponent(cid));
  }
  async connectMessageMarkRead(id: number)           { return this.vaultPost(`/connect/messages/${id}/read`, {}); }
  async connectMessagesMarkBatchRead(messageIds: number[]) { return this.vaultPost('/connect/messages/read-batch', { messageIds }); }
  async connectMessageTombstone(id: number)          { return this.vaultPost(`/connect/messages/${id}/tombstone`, {}); }

  async connectRecipientsSearch(type: 'entity' | 'regulator' | 'subscription' | 'service' | 'user', q: string) {
    return this.vaultGet(`/connect/recipients/search?type=${type}&q=${encodeURIComponent(q)}`);
  }

  // Connect v2 — per-user handles (the "alice" in alice@entityX; admin-assigned).
  async connectHandlesResolve(q: string) { return this.vaultGet('/connect/handles/resolve?q=' + encodeURIComponent(q)); }
  async vaultUserHandleGet(userId: number | string) { return this.vaultGet(`/users/${userId}/handle`); }
  async vaultUserHandleSet(userId: number | string, handle: string) { return this.vaultPut(`/users/${userId}/handle`, { handle }); }
  async vaultUserHandleClear(userId: number | string) { return this.vaultDelete(`/users/${userId}/handle`); }

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
  // Mounted on /api/v1/approvals* and /api/v1/staff/:id/approval-role (NOT
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
  async vaultUserApprovalRoleGet(userId: number | string)                       { return this.authGet('/staff/' + userId + '/approval-role'); }
  async vaultUserApprovalRoleSet(userId: number | string, approvalRole: 'none' | 'maker' | 'checker') { return this.authPut('/staff/' + userId + '/approval-role', { approvalRole }); }
}
