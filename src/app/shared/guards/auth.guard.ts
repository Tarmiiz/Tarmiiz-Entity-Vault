import { inject, Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, Router } from '@angular/router';

import { StorageService } from '../services/storage.service';
import { RpcService } from '../services/rpc.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  private router = inject( Router);
  private storageService = inject(StorageService);
  private rpcService = inject(RpcService);

  constructor() { }

  async canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Promise<boolean | UrlTree> {
    const sessionExpiry = await this.storageService.get('sessionExpiry');

    if (sessionExpiry && sessionExpiry && new Date().getTime() < +sessionExpiry) {
      await this.rpcService.setWallet();
      await this.rpcService.connectRegulatorContract()
      await this.rpcService.info();
      return true;
    }

    return this.router.parseUrl('/login');
  }
}
