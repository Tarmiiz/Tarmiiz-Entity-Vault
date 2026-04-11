import { inject, Injectable, Injector } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class AuditService {

  private apiService = inject(ApiService);
  private injector = inject(Injector);
  private router = inject(Router);

  private _authRef: any = null;

  private get authService(): any {
    if (!this._authRef) {
      try {
        this._authRef = this.injector.get((require('./auth.service') as any).AuthService);
      } catch (_) {}
    }
    return this._authRef;
  }

  private get userId(): number | null {
    return this.authService?.userInfo?.userId ?? null;
  }

  private get userName(): string {
    return this.authService?.userInfo?.name ?? '';
  }

  startNavigationTracking() {
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe((event) => {
      if (event.urlAfterRedirects.startsWith('/authorized')) {
        this.logActivity('navigation', 'page_view', event.urlAfterRedirects);
      }
    });
  }

  logActivity(category: string, action: string, target: string = '', details: any = {}) {
    this.apiService.vaultPostActivityLog({
      category,
      action,
      target,
      details: typeof details === 'string' ? details : JSON.stringify(details),
      user_id: this.userId,
      user_name: this.userName,
    });
  }

  logExport(exportType: 'excel' | 'pdf', entityType: string, details: any = {}) {
    this.logActivity('export', 'export_' + exportType, entityType, details);
    // On-chain encrypted audit log for exports
    if (this.userId) {
      this.apiService.vaultPostAuditLog({
        user_id: this.userId,
        category: 'export',
        action: 'export_' + exportType,
        target: entityType,
        details: typeof details === 'string' ? details : JSON.stringify(details),
      });
    }
  }

  logFilter(page: string, filterParams: Record<string, any>) {
    this.logActivity('filter', 'filter_query', page, filterParams);
  }

  logView(target: string, details: any = {}) {
    this.logActivity('view', 'view_detail', target, details);
  }
}
