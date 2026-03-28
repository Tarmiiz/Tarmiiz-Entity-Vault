import { inject, Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, Router } from '@angular/router';

import { StorageService } from '../services/storage.service';
import { EthersService } from '../services/ethers.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  private router = inject( Router);
  private storageService = inject(StorageService);
  private ethersService = inject(EthersService);

  constructor() { }

  async canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Promise<boolean | UrlTree> {
    const sessionExpiry = await this.storageService.get('sessionExpiry');
    
    
    if (sessionExpiry && sessionExpiry && new Date().getTime() < +sessionExpiry) {
      await this.ethersService.setWallet();
      await this.ethersService.connectVariablesProxyContract();
      await this.ethersService.connectEntityContract();
      // console.log('can activate', sessionExpiry);
      return true;
    }

    return this.router.parseUrl('public/user/login');
  }
}
