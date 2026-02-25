import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { StorageService } from './storage.service';
import { RpcService } from './rpc.service';
import { LoadingService } from '../components/alerts/loading/loading.service';
import { AlertService } from '../components/alerts/alert/alert.service';
import { Regulator, User } from '../models/data.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private router = inject(Router);
  private storageService = inject(StorageService);
  private rpcService = inject(RpcService);

  regulatorInfo!: Regulator;
  userInfo!: User;

  regulatorContractAddress = environment.regulatorAddress;
  
  constructor() {
    this.storageService.get('user').then((value) => this.userInfo = JSON.parse(value!) || {});
    // console.log('auth service');
  }
  
  async login(username: string, password: string) {
    try {

      this.loadingService.show('Connecting to Contract ...');
  
      // set regulatro contract address
      this.rpcService.regulatorContractAddress = this.regulatorContractAddress;

      // Initialize the RPC service
      await this.rpcService.init();

      // 1 hour in milliseconds
      const SESSION_DURATION = 60 * 60 * 1000;
      const expiryTime = new Date().getTime() + SESSION_DURATION;

      // Attempt login with 1 hour session duration
      this.loadingService.show('Generating zero-knowledge proof and logging in...');
      const loginResult = await this.rpcService.login(username, password, SESSION_DURATION);
      if (loginResult.success && loginResult.userId && loginResult.key) {

        // set temporary wallet
        const key = JSON.stringify(loginResult.key)

        // get user info
        const userId = Number(loginResult.userId);
        const userInfo = await this.rpcService.userInfo(userId);
        if(userInfo.result && userInfo.result.state === 2) {
          this.userInfo = userInfo.result;

          // set storage variables
          await this.storageService.set('sessionExpiry', expiryTime.toString());
          this.storageService.set('contract', this.regulatorContractAddress);
          this.storageService.set('user', JSON.stringify(this.userInfo));
          this.storageService.set('wallet', key);

          // get regulator info
          // await this.rpcService.regulatorInfoGet();

          return { success: true, error: '' };
        
        }
        else {
          return { success: false, error: userInfo.error };
        }        
      }
      else {
          return { success: false, error: loginResult.error };
      }        

    }
    catch (error) {
          return { success: false, error: error };
    }
    finally {
      this.loadingService.hide();
    }

  }

  async logout() {
    const confirmed =await this.alertService.show('Logout', 'Are you sure you want to logout?');
    if(!confirmed) return;
    this.loadingService.show('Closing session ...');
    await this.storageService.remove('sessionExpiry');
    await this.storageService.remove('contract');
    await this.storageService.remove('wallet');
    await this.storageService.remove('user');
    await this.rpcService.logout(); 
    this.loadingService.hide();
    this.router.navigate(['/public/user/login']);
  }
}
