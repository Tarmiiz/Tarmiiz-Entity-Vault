import { inject, Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, Router } from '@angular/router';

import { StorageService } from '../services/storage.service';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  private router = inject(Router);
  private storageService = inject(StorageService);

  async canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Promise<boolean | UrlTree> {
    const allowedRoles: number[] = next.data['allowedRoles'] ?? [];

    const userRaw = await this.storageService.get('user');
    const role: number = userRaw ? JSON.parse(userRaw)?.role : null;

    // Security officer (4) is deny-by-default: routes with no allowedRoles
    // are open to every other role, but role 4 may only enter routes that
    // explicitly include it. Redirect to the audit trail (not the dashboard,
    // which excludes role 4 and would loop). The server enforces the same
    // allowlist — this is UX, not the security boundary.
    if (role === 4) {
      return allowedRoles.includes(4) ? true : this.router.parseUrl('authorized/logs/system');
    }

    if (allowedRoles.length === 0) {
      return true;
    }

    if (allowedRoles.includes(role)) {
      return true;
    }

    return this.router.parseUrl('authorized/dashboard');
  }
}
