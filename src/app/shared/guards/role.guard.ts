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

    if (allowedRoles.length === 0) {
      return true;
    }

    const userRaw = await this.storageService.get('user');
    const role: number = userRaw ? JSON.parse(userRaw)?.role : null;

    if (allowedRoles.includes(role)) {
      return true;
    }

    return this.router.parseUrl('authorized/dashboard');
  }
}
