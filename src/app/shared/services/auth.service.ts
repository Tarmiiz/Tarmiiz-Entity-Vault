import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

import { StorageService } from './storage.service';
import { EthersService } from './ethers.service';
import { ApiService } from './api.service';
import { SocketService } from './socket.service';
import { SessionService } from './session.service';
import { FeaturesService } from './features.service';
import { LoadingService } from '../components/alerts/loading/loading.service';
import { AlertService } from '../components/alerts/alert/alert.service';
import { Entity, User } from '../models/data.model';
import { ParseProofUtils } from '../utils/parse-proof.utils';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);
  private router = inject(Router);
  private storageService = inject(StorageService);
  private ethersService = inject(EthersService);
  private apiService = inject(ApiService);
  private socketService = inject(SocketService);
  private sessionService = inject(SessionService);
  private featuresService = inject(FeaturesService);

  entityInfo!: Entity;
  userInfo!: User;

  /** Reactive signal for entity active state — updated on login and via refreshEntityState() */
  entityActive = signal(true);
  entityStateReason = signal('');

  get isEntityActive(): boolean {
    return this.entityInfo?.state === 2;
  }

  private _ready: Promise<void>;

  constructor() {
    this._ready = this.storageService.get('user').then((value) => { this.userInfo = JSON.parse(value!) || {}; });
    // console.log('auth service');
  }

  ready(): Promise<void> {
    return this._ready;
  }
  
  async login(username: string, password: string) {
    try {

      this.loadingService.show(this.translate.instant('auth.zk.connecting'));

      // Fetch blockchain config from API
      const config = await this.apiService.vaultGetConfig();
      if (!config) return { success: false, error: 'Failed to fetch configuration' };

      // Configure ethers with blockchain addresses and initialize
      this.ethersService.configure(config.rpcNode, config.entityContract, config.globalVariablesProxyContract, config.globalSalt);
      await this.ethersService.init();

      // Bootstrap-admin claim detection: if the loginHash maps to an unclaimed bootstrap admin,
      // bail out early and route into the claim wizard. The user enters their email + the
      // activation OTP they received via email, then sets their own password — see /public/user/claim.
      try {
        await ParseProofUtils.init();
        const usernameBigInt = ParseProofUtils.stringToBigInt(username);
        const loginHash      = ParseProofUtils.hashStringForContract(usernameBigInt);
        const status = await this.apiService.vaultUserClaimStatus(loginHash);
        if (status && status.exists && !status.claimed) {
          this.loadingService.hide();
          await this.router.navigate(['/public/user/claim'], { queryParams: { email: username } });
          return { success: false, error: 'CLAIM_REQUIRED' };
        }
      } catch { /* fall through to normal login */ }

      // On-chain session duration (SECONDS) for the login proof — the ONLY thing
      // sessionDuration still drives (the off-chain refresh window is server-owned + sliding;
      // see SessionService / the API's sessions.js). It MUST stay >= the API's
      // SESSION_MAX_TTL_SEC (8h) so the on-chain admin session (_adminSigner) stays valid for
      // the whole sliding off-chain session — every user-management / signer-key / document-
      // signing / config call relays through it and would revert once the on-chain session lapsed.
      const SESSION_DURATION = 12 * 60 * 60; // 12 hours, in SECONDS (> the 8h off-chain cap)

      // A cold first attempt can fail on the chain side ("invalid zk proof" from
      // un-warmed snarkjs, or stale "nonce mismatch" / "commitment mismatch" from
      // a prior pending logout). Regenerate + resubmit once on transient errors.
      this.loadingService.show(this.translate.instant('auth.zk.verifying'));
      let loginResult = await this.apiService.entityLogin(username, password, SESSION_DURATION);
      const transient = /nonce mismatch|commitment mismatch|invalid zk proof|No UserAccess event|Login API call failed/i;
      if (!(loginResult.success && loginResult.userId) && transient.test(String(loginResult.error ?? ''))) {
        loginResult = await this.apiService.entityLogin(username, password, SESSION_DURATION);
      }
      if (loginResult.success && loginResult.userId && loginResult.key) {

        // Persist the JWT immediately so the authenticated calls below pick it up.
        if (loginResult.token && loginResult.expiresAt && loginResult.refreshExpiresAt) {
          await this.sessionService.setSession(loginResult.token, loginResult.expiresAt, loginResult.refreshExpiresAt);
        }

        // set temporary wallet
        const key = JSON.stringify(loginResult.key)

        // get user info
        this.loadingService.show(this.translate.instant('auth.zk.fetchingProfile'));
        const userId = Number(loginResult.userId);
        const user = await this.apiService.vaultGetUser(String(userId));
        if (user && user.state === 2) {
          this.userInfo = user;

          // check entity state — block login if entity is not active
          const entityData = await this.apiService.vaultGetEntityInfo();
          if (!entityData || entityData.state !== 2) {
            return { success: false, error: 'Entity is suspended or deactivated. Contact your regulator.' };
          }
          this.entityInfo = entityData;
          this.entityActive.set(entityData.state === 2);

          // set storage variables
          this.storageService.set('rpcNode', config.rpcNode);
          this.storageService.set('variablesProxyContract', config.globalVariablesProxyContract);
          this.storageService.set('contract', config.entityContract);
          this.storageService.set('user', JSON.stringify(this.userInfo));
          this.storageService.set('wallet', key);

          // Re-hydrate the menu feature map for THIS user — the eager pre-login fetch
          // used the public tenant map; now pull /vault/features/me so per-user menu
          // overrides take effect on the sidebar + route guards.
          await this.featuresService.refresh();

          // connect real-time socket
          this.socketService.connect();

          // keep loading spinner visible — the dashboard will hide it after loading
          this.loadingService.show(this.translate.instant('auth.zk.loadingDashboard'));
          return { success: true, error: '' };

        }
        else {
          this.loadingService.hide();
          return { success: false, error: user ? 'User is not active' : 'Error fetching info' };
        }
      }
      else {
          this.loadingService.hide();
          return { success: false, error: loginResult.error };
      }

    }
    catch (error) {
          this.loadingService.hide();
          return { success: false, error: error };
    }

  }

  async refreshEntityState() {
    try {
      const entityData = await this.apiService.vaultGetEntityInfo();
      if (entityData) {
        this.entityInfo = entityData;
        this.entityActive.set(entityData.state === 2);
        if (entityData.state !== 2 && entityData.address) {
          const logs = await this.apiService.vaultGetStateChangeLogs(entityData.address, 1, 1);
          this.entityStateReason.set(logs?.logs?.[0]?.reason || '');
        } else {
          this.entityStateReason.set('');
        }
      }
    } catch (_) { /* silent — entity state will remain stale until next refresh */ }
  }

  async logout() {
    const confirmed = await this.alertService.show(this.translate.instant('header.logout'), this.translate.instant('auth.logoutConfirm'));
    if(!confirmed) return;
    this.loadingService.show('Closing session...');
    this.socketService.disconnect();
    // Server logout MUST complete before we clear local state and navigate —
    // otherwise the browser cancels the in-flight HTTP request on route
    // change and the on-chain Auth/Logout audit row never gets emitted.
    try { await this.apiService.entityLogout(); } catch { /* silent */ }
    await Promise.all([
      this.storageService.remove('sessionExpiry'),
      this.storageService.remove('rpcNode'),
      this.storageService.remove('variablesProxyContract'),
      this.storageService.remove('contract'),
      this.storageService.remove('wallet'),
      this.storageService.remove('user'),
      this.sessionService.clear(),
    ]);
    // Token gone — re-hydrate features back to the public tenant map.
    await this.featuresService.refresh();
    await this.router.navigate(['/public/user/login']);
    this.loadingService.hide();
  }
}
