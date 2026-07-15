import { inject, Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, Router } from '@angular/router';

import { SessionService } from '../services/session.service';
import { EthersService } from '../services/ethers.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  private router = inject( Router);
  private sessionService = inject(SessionService);
  private ethersService = inject(EthersService);

  constructor() { }

  async canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Promise<boolean | UrlTree> {
    // Gate on the real (sliding) session: getActiveToken() returns a token while inside
    // the refresh window, proactively refreshes when near access expiry (so navigating
    // counts as activity), and returns null once the window has elapsed.
    const token = await this.sessionService.getActiveToken();

    if (token) {
      await this.ethersService.setWallet();
      await this.ethersService.connectVariablesProxyContract();
      await this.ethersService.connectEntityContract();
      return true;
    }

    return this.router.parseUrl('public/user/login');
  }
}
