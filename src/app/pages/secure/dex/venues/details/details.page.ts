import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ethers } from 'ethers';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";
import { LiveIndicatorComponent } from "../../../../../shared/components/live-indicator/live-indicator.component";
import { ApiService } from '../../../../../shared/services/api.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { SocketService } from '../../../../../shared/services/socket.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { DexVenue, DexOrder, DexTrade } from '../../../../../shared/models/data.model';

import { ModalVenueStateService } from '../modals/modal-venue-state/modal-venue-state.service';
import { ModalVenueStateComponent } from '../modals/modal-venue-state/modal-venue-state.component';

@Component({
  selector: 'app-dex-venue-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, LiveIndicatorComponent, RouterLink, ModalVenueStateComponent, TranslatePipe],
})
export class DetailsPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private socket = inject(SocketService);
  utils = inject(UtilsService);
  features = inject(FeaturesService);
  private stateModal = inject(ModalVenueStateService);
  private authService = inject(AuthService);
  private translate = inject(TranslateService);

  get userInfo() { return this.authService.userInfo; }

  serviceAddress = signal<string>('');
  venue = signal<DexVenue | undefined>(undefined);
  activeTab = signal<'info' | 'assets' | 'orders' | 'trades'>('info');
  venueOrders = signal<DexOrder[]>([]);
  venueTrades = signal<DexTrade[]>([]);
  venueAssets = signal<any[]>([]);
  refreshing = signal(false);

  private sub?: Subscription;

  constructor() {
    const address = this.route.snapshot.paramMap.get('address');
    if (address) this.serviceAddress.set(address);
  }

  ngOnInit() {}

  async ionViewWillEnter() {
    await this.loadVenue();
    await Promise.all([this.loadOrders(), this.loadTrades(), this.loadAssets()]);
    this.sub = this.socket.vaultUpdated$.subscribe(async p => {
      const isRelevant = p.type === 'dex-venue' || p.type === 'dex-order' || p.type === 'dex-trade' || p.type === 'dex-asset-venue';
      if (!isRelevant) return;
      this.refreshing.set(true);
      try {
        if (p.type === 'dex-venue') await this.loadVenue(true);
        if (p.type === 'dex-order') await this.loadOrders();
        if (p.type === 'dex-trade') await this.loadTrades();
        if (p.type === 'dex-asset-venue') await this.loadAssets();
      } finally {
        this.refreshing.set(false);
      }
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async loadVenue(silent = false) {
    if (!silent) this.loadingService.show(this.translate.instant('dex.venues.details.loadingVenue'));
    const data = await this.apiService.vaultDexVenueInfo(this.serviceAddress());
    this.venue.set(data);
    if (!silent) this.loadingService.hide();
  }

  async loadOrders() {
    const r = await this.apiService.vaultDexOrdersList({ venue: this.serviceAddress(), offset: 200 });
    if (r?.orders) this.venueOrders.set(r.orders);
  }

  async loadTrades() {
    const r = await this.apiService.vaultDexTradesList({ venue: this.serviceAddress(), offset: 200 });
    if (r?.trades) this.venueTrades.set(r.trades);
  }

  async loadAssets() {
    const r = await this.apiService.vaultDexVenueAssets(this.serviceAddress());
    this.venueAssets.set(r?.assets || []);
  }

  setTab(tab: 'info' | 'assets' | 'orders' | 'trades') { this.activeTab.set(tab); }

  tierLabelShort(tier: number): string {
    if (tier !== 1 && tier !== 2 && tier !== 3) return '—';
    return this.tierLabel(tier);
  }
  goAsset(baseAsset: string) { this.router.navigate(['/authorized/dex/asset-listings/details/' + baseAsset]); }

  fmtPrice(wei: string) { try { return Number(ethers.formatEther(wei || '0')).toLocaleString(undefined, { maximumFractionDigits: 6 }); } catch { return '0'; } }
  fmtAmount(n: string) { return Number(n || '0').toLocaleString(); }

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

  goOrder(id: number) { this.router.navigate(['/authorized/dex/orders/details/' + id]); }
  goTrade(id: number) { this.router.navigate(['/authorized/dex/trades/details/' + id]); }

  formatMs(ms: number): string {
    if (!ms) return '—';
    return this.utils.formatDate(Math.floor(ms / 1000));
  }

  stateName(s: number): string {
    switch (s) {
      case 1: return this.translate.instant('state.registered');
      case 2: return this.translate.instant('state.active');
      case 3: return this.translate.instant('state.paused');
      case 4: return this.translate.instant('state.deregistered');
      default: return String(s);
    }
  }

  getStateClass(stateId: number | undefined): string {
    if (stateId === undefined) return 'bg-gray-100 text-gray-800';
    switch (stateId) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  tierLabel(tier: 1 | 2 | 3): string {
    const scope = tier === 1 ? this.translate.instant('dex.venues.tier.scopeVenue')
      : tier === 2 ? this.translate.instant('dex.venues.tier.scopeCountry')
      : this.translate.instant('dex.venues.tier.scopeGlobal');
    return this.translate.instant('dex.venues.tier.withScope', { n: tier, scope });
  }
  tierStatus(tier: 1 | 2 | 3): { code: 'approved' | 'pending' | 'none'; label: string; cls: string } {
    const v = this.venue();
    if (!v) return { code: 'none', label: '—', cls: 'bg-gray-100 text-gray-800' };
    const approved = tier === 1 ? v.tier1Approved : tier === 2 ? v.tier2Approved : v.tier3Approved;
    const pending  = tier === 1 ? v.tier1Pending  : tier === 2 ? v.tier2Pending  : v.tier3Pending;
    if (approved) return { code: 'approved', label: this.translate.instant('state.approved'), cls: 'bg-green-100 text-green-800' };
    if (pending)  return { code: 'pending', label: this.translate.instant('dex.venues.tier.pendingApproval'), cls: 'bg-yellow-100 text-yellow-800' };
    return { code: 'none', label: this.translate.instant('dex.venues.tier.notRequested'), cls: 'bg-gray-100 text-gray-800' };
  }

  async requestTier(tier: 1 | 2 | 3) {
    const v = this.venue();
    if (!v) return;
    const ok = await this.alertService.show(
      this.translate.instant('dex.venues.tier.requestModal.title'),
      this.translate.instant('dex.venues.tier.requestModal.message', { tier: this.tierLabel(tier) }),
      this.translate.instant('dex.venues.tier.requestModal.confirm')
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('dex.venues.details.requestingTier'));
    try {
      const r = await this.apiService.vaultDexVenueRequestTier(v.serviceAddress, tier);
      if (r?.error) this.alertService.show(this.translate.instant('alerts.error'), r.error);
      await this.loadVenue();
    } finally { this.loadingService.hide(); }
  }

  async openStateModal() {
    const v = this.venue();
    if (!v) return;
    if (v.state === 4) {
      this.alertService.show(this.translate.instant('dex.venues.details.notAllowedTitle'), this.translate.instant('dex.venues.details.terminalStateMessage'));
      return;
    }
    const result = await this.stateModal.show(v.state);
    if (!result) return;
    if (result.newState === 4) {
      const ok = await this.alertService.show(
        this.translate.instant('dex.venues.details.deactivateTitle'),
        this.translate.instant('dex.venues.details.deactivateMessage'),
        this.translate.instant('dex.venues.details.deactivateConfirm')
      );
      if (!ok) return;
    }
    this.loadingService.show(this.translate.instant('dex.venues.details.updatingState'));
    try {
      const r = await this.apiService.vaultDexVenueSetState(v.serviceAddress, result.newState);
      if (r?.error) this.alertService.show(this.translate.instant('alerts.error'), r.error);
      await this.loadVenue();
    } finally { this.loadingService.hide(); }
  }
}
