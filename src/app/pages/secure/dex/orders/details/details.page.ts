import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ethers } from 'ethers';

import { HeaderComponent } from '../../../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../../../shared/components/live-indicator/live-indicator.component';
import { ApiService } from '../../../../../shared/services/api.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { SocketService } from '../../../../../shared/services/socket.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { DexOrder, DexTrade } from '../../../../../shared/models/data.model';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { PaginatorComponent, pageSlice } from '../../../../../shared/components/paginator/paginator.component';

@Component({
  selector: 'app-vault-dex-order-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [HeaderComponent, LiveIndicatorComponent, RouterLink, TranslatePipe, PaginatorComponent],
})
export class DetailsPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private socket = inject(SocketService);
  features = inject(FeaturesService);
  utils = inject(UtilsService);
  private authService = inject(AuthService);
  private translate = inject(TranslateService);

  orderRef = signal<string>('');
  order = signal<DexOrder | undefined>(undefined);
  linkedTrades = signal<DexTrade[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  linkedTradesPage = signal(1);
  linkedTradesPageSize = signal(25);
  pagedLinkedTrades = computed(() => pageSlice(this.linkedTrades(), this.linkedTradesPage(), this.linkedTradesPageSize()));
  activeTab = signal<'info' | 'trades'>('info');
  refreshing = signal(false);

  private sub?: Subscription;

  constructor() {
    // Phase 16 — a `bytes32` COMMITMENT REF, not a numeric id. `Number(ref)` is NaN.
    const ref = this.route.snapshot.paramMap.get('ref');
    if (ref) this.orderRef.set(ref);
  }

  ngOnInit() {}

  async ionViewWillEnter() {
    await this.load();
    this.sub = this.socket.vaultUpdated$.subscribe(p => {
      if (p.type === 'dex-order' || p.type === 'dex-trade') this.load(true);
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async load(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show(this.translate.instant('dex.orders.details.loadingOrder'));
    try {
      const o = await this.apiService.vaultDexOrderInfo(this.orderRef());
      if (o) {
        this.order.set(o);
        const t = await this.apiService.vaultDexTradesList({ asset: o.baseAsset, offset: 200 });
        if (t?.trades) {
          const linked = (t.trades as DexTrade[]).filter(x => x.buyRef === o.ref || x.sellRef === o.ref);
          this.linkedTrades.set(linked);
        }
      }
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  setTab(t: 'info' | 'trades') { this.activeTab.set(t); }

  fmtPrice(v: string | number) { const n = Number(v ?? 0); return this.utils.formatPrice(Number.isFinite(n) ? n : 0); }
  fmtAmount(n: string) { return Number(n || '0').toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  fillPct(o: DexOrder | undefined): number {
    if (!o) return 0;
    const a = Number(o.amount || '0');
    const f = Number(o.filled || '0');
    return a > 0 ? Math.min(100, Math.round((f / a) * 100)) : 0;
  }

  getStatusClass(s: number | undefined): string {
    switch (Number(s)) {
      case 1: return 'bg-blue-100 text-blue-800';
      case 2: return 'bg-yellow-100 text-yellow-800';
      case 3: return 'bg-green-100 text-green-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  getSideClass(s: number | undefined): string {
    return Number(s) === 1 ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800';
  }

  canCancel = computed(() => {
    const o = this.order();
    if (!o) return false;
    return (Number(o.status) === 1 || Number(o.status) === 2)
        && Number(this.authService.userInfo?.role) !== 3
        && this.features.systemFunctionEnabled('dex-order-cancel');
  });

  async cancel() {
    const o = this.order();
    if (!o) return;
    const ok = await this.alertService.show(
      this.translate.instant('dex.orders.cancelConfirm.title'),
      this.translate.instant('dex.orders.cancelConfirm.message', { id: this.shortRef(o.ref) }),
      this.translate.instant('dex.orders.cancelConfirm.confirm')
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('dex.orders.cancelConfirm.loading'));
    try {
      const r = await this.apiService.vaultDexCancelOrder(o.ref);
      if (r?.error) this.alertService.info(this.translate.instant('alerts.error'), r.error);
      await this.load();
    } finally { this.loadingService.hide(); }
  }

  shortRef(r: string): string {
    const s = String(r || '');
    return s.length > 18 ? s.slice(0, 8) + '…' + s.slice(-6) : s;
  }

  goTrade(id: number) { this.router.navigate(['/authorized/dex/trades/details/' + id]); }
}
