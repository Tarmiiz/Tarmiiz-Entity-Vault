import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ethers } from 'ethers';

import { HeaderComponent } from '../../../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../../../shared/components/live-indicator/live-indicator.component';
import { ApiService } from '../../../../../shared/services/api.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { SocketService } from '../../../../../shared/services/socket.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { DexOrder } from '../../../../../shared/models/data.model';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { RefreshButtonComponent } from '../../../../../shared/components/refresh-button/refresh-button.component';

@Component({
  selector: 'app-vault-dex-order-book-view',
  templateUrl: './view.page.html',
  styleUrls: ['./view.page.scss'],
  standalone: true,
  imports: [RefreshButtonComponent, FormsModule, HeaderComponent, LiveIndicatorComponent, RouterLink, TranslatePipe],
})
export class ViewPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private socket = inject(SocketService);
  private auth = inject(AuthService);
  features = inject(FeaturesService);
  utils = inject(UtilsService);
  private translate = inject(TranslateService);

  baseAsset = signal<string>('');
  scope = signal<'venue' | 'country' | 'global'>('venue');
  dexService = signal<string>('');
  countryCode = signal<number | null>(null);
  currencyCode = signal<number | null>(null);

  bestBid = signal<{ ref: string; price: string } | null>(null);
  bestAsk = signal<{ ref: string; price: string } | null>(null);
  bids = signal<DexOrder[]>([]);
  asks = signal<DexOrder[]>([]);
  asOf = signal<number>(0);

  selectedBuy = signal<string | null>(null);
  selectedSell = signal<string | null>(null);
  refreshing = signal(false);

  private sub?: Subscription;
  private poller?: any;

  constructor() {
    const a = this.route.snapshot.paramMap.get('asset');
    if (a) this.baseAsset.set(a);
    const dex = this.route.snapshot.queryParamMap.get('dexService');
    if (dex) { this.dexService.set(dex); this.scope.set('venue'); }
    const cc = this.route.snapshot.queryParamMap.get('countryCode');
    if (cc) { this.countryCode.set(Number(cc)); this.scope.set('country'); }
    const cur = this.route.snapshot.queryParamMap.get('currencyCode');
    if (cur) {
      this.currencyCode.set(Number(cur));
      if (!dex && !cc) this.scope.set('global');
    }
  }

  ngOnInit() {}

  async ionViewDidEnter() {
    await this.refresh();
    this.sub = this.socket.vaultUpdated$.subscribe(p => {
      if (p.type === 'dex-order' || p.type === 'dex-trade') this.refresh(true);
    });
    this.poller = setInterval(() => this.refresh(true), 5000);
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    if (this.poller) clearInterval(this.poller);
  }

  isExec(): boolean { return Number(this.auth.userInfo?.role) === 2; }

  async refresh(silent = false) {
    if (!this.baseAsset()) return;
    const params: any = {};
    if (this.scope() === 'venue' && this.dexService()) params.dexService = this.dexService();
    else if (this.scope() === 'country' && this.countryCode()) {
      params.countryCode = this.countryCode();
      if (this.currencyCode()) params.currencyCode = this.currencyCode();
    } else if (this.scope() === 'global' && this.currencyCode()) params.currencyCode = this.currencyCode();
    else return;
    if (silent) this.refreshing.set(true);
    try {
      const r = await this.apiService.vaultDexOrderBook(this.baseAsset(), params);
      if (r) {
        this.bestBid.set(r.bestBid ?? null);
        this.bestAsk.set(r.bestAsk ?? null);
        this.bids.set(r.bids || []);
        this.asks.set(r.asks || []);
        this.asOf.set(Math.floor(Date.now() / 1000));
      }
    } finally {
      if (silent) this.refreshing.set(false);
    }
  }

  fmtPrice(v: string | number) { const n = Number(v ?? 0); return this.utils.formatPrice(Number.isFinite(n) ? n : 0); }
  fmtAmount(n: string) { return Number(n || '0').toLocaleString('en-US', { maximumFractionDigits: 0 }); }

  selectBuy(o: DexOrder) { this.selectedBuy.set(o.ref === this.selectedBuy() ? null : o.ref); }
  selectSell(o: DexOrder) { this.selectedSell.set(o.ref === this.selectedSell() ? null : o.ref); }

  shortRef(r: string): string {
    const s = String(r || '');
    return s.length > 18 ? s.slice(0, 8) + '…' + s.slice(-6) : s;
  }

  canMatch(): boolean {
    return this.isExec() && this.selectedBuy() !== null && this.selectedSell() !== null;
  }

  async match() {
    const buy = this.selectedBuy();
    const sell = this.selectedSell();
    if (buy === null || sell === null) return;
    const ok = await this.alertService.show(
      this.translate.instant('dex.orderBook.matchConfirm.title'),
      this.translate.instant('dex.orderBook.matchConfirm.message', { buy: this.shortRef(buy), sell: this.shortRef(sell) }),
      this.translate.instant('dex.orderBook.matchConfirm.confirm')
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('dex.orderBook.matchingOrders'));
    try {
      const r = await this.apiService.vaultDexMatchOrders(buy, sell);
      if (r?.error) this.alertService.info(this.translate.instant('alerts.error'), r.error);
      this.selectedBuy.set(null);
      this.selectedSell.set(null);
      await this.refresh();
    } finally { this.loadingService.hide(); }
  }

  goOrder(o: DexOrder) { this.router.navigate(['/authorized/dex/orders/details/' + o.ref]); }
}
