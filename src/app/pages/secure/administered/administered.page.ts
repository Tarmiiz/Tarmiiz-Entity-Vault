import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../shared/components/header/header.component';
import { ApiService } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { FeaturesService } from '../../../shared/services/features.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { User } from '../../../shared/models/data.model';
import { TabsComponent, TabDef } from '../../../shared/components/tabs/tabs.component';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UtilsService } from '../../../shared/services/utils.service';

/**
 * §H (post-code-fix H.6, 2026-09-28) — ADMINISTERED ASSETS.
 *
 * The assets this entity serves as Fund Administrator (asset role 13) or Asset Custodian (role 14): ONE seat per
 * asset, proposed by the issuer and accepted here. What the seat may DO is its regulator's root rows on our
 * service — `price-publish`, `view-holdings`, `view-transactions` — so every tab is a LIVE read the contract
 * gates, and a missing row answers "not granted" rather than an empty table.
 */
interface Seat {
  asset: string;
  name: string;
  symbol: string;
  service: string;
  serviceName: string;
  baseRole: number;
  role: 'fund-administrator' | 'asset-custodian';
  state: number;
  accepted: boolean;
  updatedAt: number;
}

type DetailTab = 'register' | 'transactions' | 'prices';

@Component({
  selector: 'app-administered',
  templateUrl: './administered.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, TranslatePipe, TabsComponent, MoneyPipe],
})
export class AdministeredPage {
  private apiService     = inject(ApiService);
  private authService    = inject(AuthService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);
  features = inject(FeaturesService);
  utils    = inject(UtilsService);

  userInfo!: User;
  loaded = signal(false);
  seats = signal<Seat[]>([]);
  selected = signal<Seat | null>(null);

  readonly detailTabs: DetailTab[] = ['register', 'transactions', 'prices'];
  tabDefs = computed<TabDef[]>(() => this.detailTabs.map(t => ({ key: t, label: 'administered.tabs.' + t })));
  activeTab = signal<DetailTab>('register');

  // One slot per tab: rows, or a refusal message (a contract "not granted" is an ANSWER, never an empty list).
  holders = signal<any[] | null>(null);
  transactions = signal<any[] | null>(null);
  prices = signal<any[] | null>(null);
  tabError = signal('');
  tabLoading = signal(false);

  priceModalOpen = signal(false);
  priceBid = '';
  priceAsk = '';
  priceDate = '';
  priceError = signal('');

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    await this.loadSeats();
  }

  private async loadSeats() {
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      const data = await this.apiService.vaultAdministeredAssets();
      this.seats.set(Array.isArray(data?.assets) ? data.assets : []);
    } finally {
      this.loadingService.hide();
      this.loaded.set(true);
    }
  }

  roleLabel(s: Seat) {
    return this.translate.instant(s.role === 'fund-administrator' ? 'administered.roleFa' : 'administered.roleCustodian');
  }

  canAct(): boolean {
    return !!this.userInfo && this.userInfo.role !== 3;
  }

  canPublish(s: Seat | null): boolean {
    return !!s && s.accepted && s.role === 'fund-administrator' && this.canAct()
      && this.features.systemFunctionEnabled('asset-fa-price-publish');
  }

  async accept(s: Seat) {
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      const res: any = await this.apiService.vaultAdministeredAccept(s.asset, s.service);
      if (!res || res.type === 'error' || res.error) {
        this.alertService.info(this.translate.instant('alerts.updateFailed'), res?.error || this.translate.instant('alerts.unexpected'));
        return;
      }
    } finally {
      this.loadingService.hide();
    }
    await this.loadSeats();
  }

  async open(s: Seat) {
    this.selected.set(s);
    await this.setTab('register');
  }

  close() {
    this.selected.set(null);
  }

  async setTab(tab: DetailTab) {
    this.activeTab.set(tab);
    const s = this.selected();
    if (!s) return;
    this.tabError.set('');
    this.tabLoading.set(true);
    try {
      let res: any;
      if (tab === 'register') {
        res = await this.apiService.vaultAdministeredHolders(s.asset, 1, 100);
        this.holders.set(res?.holders ?? null);
      } else if (tab === 'transactions') {
        res = await this.apiService.vaultAdministeredTransactions(s.asset, 1, 100);
        this.transactions.set(res?.transactions ?? null);
      } else {
        res = await this.apiService.vaultAdministeredPrices(s.asset, 1, 100);
        this.prices.set(res?.history ?? null);
      }
      if (!res || res.type === 'error' || res.error) {
        this.tabError.set(res?.error || this.translate.instant('administered.readFailed'));
      }
    } finally {
      this.tabLoading.set(false);
    }
  }

  openPriceModal() {
    this.priceBid = ''; this.priceAsk = ''; this.priceDate = '';
    this.priceError.set('');
    this.priceModalOpen.set(true);
  }

  async submitPrice() {
    const s = this.selected();
    if (!s) return;
    const bid = Number(this.priceBid), ask = Number(this.priceAsk || this.priceBid);
    if (!(bid > 0) || !(ask > 0)) { this.priceError.set(this.translate.instant('administered.price.invalid')); return; }
    // The effective time is optional: absent = block time. A date-time picker yields local time.
    const timestamp = this.priceDate ? Math.floor(new Date(this.priceDate).getTime() / 1000) : 0;
    this.loadingService.show(this.translate.instant('common.loadingData'));
    let res: any;
    try {
      res = await this.apiService.vaultAdministeredPublishPrice(s.asset, { bid, ask, timestamp });
    } finally {
      this.loadingService.hide();
    }
    if (!res || res.type === 'error' || res.error) {
      this.priceError.set(res?.error || this.translate.instant('alerts.unexpected'));
      return;
    }
    this.priceModalOpen.set(false);
    await this.setTab('prices');
  }
}
