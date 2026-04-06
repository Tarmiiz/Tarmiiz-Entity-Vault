import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

import { StorageService } from './storage.service';
import { EthersService } from './ethers.service';
import { ApiService } from './api.service';
import { SocketService } from './socket.service';
import { LoadingService } from '../components/alerts/loading/loading.service';
import { AlertService } from '../components/alerts/alert/alert.service';
import { Entity, User } from '../models/data.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private router = inject(Router);
  private storageService = inject(StorageService);
  private ethersService = inject(EthersService);
  private apiService = inject(ApiService);
  private socketService = inject(SocketService);

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

      this.loadingService.show('Connecting to Contract ...');

      // Fetch blockchain config from API
      const config = await this.apiService.vaultGetConfig();
      if (!config) return { success: false, error: 'Failed to fetch configuration' };

      // Configure ethers with blockchain addresses and initialize
      this.ethersService.configure(config.rpcNode, config.entityContract, config.globalVariablesProxyContract);
      await this.ethersService.init();

      // 1 hour in milliseconds
      const SESSION_DURATION = 60 * 60 * 1000;
      const expiryTime = new Date().getTime() + SESSION_DURATION;

      // Attempt login with 1 hour session duration
      this.loadingService.show('Generating zero-knowledge proof and logging in...');
      const loginResult = await this.apiService.entityLogin(username, password, SESSION_DURATION);
      if (loginResult.success && loginResult.userId && loginResult.key) {

        // set temporary wallet
        const key = JSON.stringify(loginResult.key)

        // get user info
        const userId = Number(loginResult.userId);
        const userInfo = await this.ethersService.userInfo(userId);
        if(userInfo.result && userInfo.result.state === 2) {
          this.userInfo = userInfo.result;

          // check entity state — block login if entity is not active
          const entityData = await this.apiService.vaultGetEntityInfo();
          if (!entityData || entityData.state !== 2) {
            return { success: false, error: 'Entity is suspended or deactivated. Contact your regulator.' };
          }
          this.entityInfo = entityData;
          this.entityActive.set(entityData.state === 2);

          // set storage variables
          await this.storageService.set('sessionExpiry', expiryTime.toString());
          this.storageService.set('rpcNode', config.rpcNode);
          this.storageService.set('variablesProxyContract', config.globalVariablesProxyContract);
          this.storageService.set('contract', config.entityContract);
          this.storageService.set('user', JSON.stringify(this.userInfo));
          this.storageService.set('wallet', key);

          // connect real-time socket
          this.socketService.connect();

          // keep loading spinner visible — the dashboard will hide it after loading
          this.loadingService.show('Loading dashboard...');
          return { success: true, error: '' };

        }
        else {
          this.loadingService.hide();
          return { success: false, error: userInfo.error };
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
    const confirmed =await this.alertService.show('Logout', 'Are you sure you want to logout?');
    if(!confirmed) return;
    this.loadingService.show('Closing session ...');
    this.socketService.disconnect();
    await this.storageService.remove('sessionExpiry');
    await this.storageService.remove('rpcNode');
    await this.storageService.remove('variablesProxyContract');
    await this.storageService.remove('contract');
    await this.storageService.remove('wallet');
    await this.storageService.remove('user');
    await this.apiService.entityLogout();
    this.loadingService.hide();
    this.router.navigate(['/public/user/login']);
  }
}
