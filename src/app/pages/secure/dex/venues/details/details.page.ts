import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ethers } from 'ethers';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";
import { LiveIndicatorComponent } from "../../../../../shared/components/live-indicator/live-indicator.component";
import { ApiService } from '../../../../../shared/services/api.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { SocketService } from '../../../../../shared/services/socket.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { DexVenue, DexOrder, DexTrade } from '../../../../../shared/models/data.model';

import { ModalVenueStateService } from '../modals/modal-venue-state/modal-venue-state.service';
import { ModalVenueStateComponent } from '../modals/modal-venue-state/modal-venue-state.component';

@Component({
  selector: 'app-dex-venue-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, LiveIndicatorComponent, RouterLink, ModalVenueStateComponent],
})
export class DetailsPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private socket = inject(SocketService);
  utils = inject(UtilsService);
  private stateModal = inject(ModalVenueStateService);

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
    if (!silent) this.loadingService.show('Loading venue...');
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
    return tier === 1 ? 'Tier 1 — Venue' : tier === 2 ? 'Tier 2 — Country' : tier === 3 ? 'Tier 3 — Global' : '—';
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
      case 1: return 'Registered';
      case 2: return 'Active';
      case 3: return 'Paused';
      case 4: return 'Deregistered';
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
    return tier === 1 ? 'Tier 1 — Venue' : tier === 2 ? 'Tier 2 — Country' : 'Tier 3 — Global';
  }
  tierStatus(tier: 1 | 2 | 3): { label: string; cls: string } {
    const v = this.venue();
    if (!v) return { label: '—', cls: 'bg-gray-100 text-gray-800' };
    const approved = tier === 1 ? v.tier1Approved : tier === 2 ? v.tier2Approved : v.tier3Approved;
    const pending  = tier === 1 ? v.tier1Pending  : tier === 2 ? v.tier2Pending  : v.tier3Pending;
    if (approved) return { label: 'Approved', cls: 'bg-green-100 text-green-800' };
    if (pending)  return { label: 'Pending regulator approval', cls: 'bg-yellow-100 text-yellow-800' };
    return { label: 'Not requested', cls: 'bg-gray-100 text-gray-800' };
  }

  async requestTier(tier: 1 | 2 | 3) {
    const v = this.venue();
    if (!v) return;
    const ok = await this.alertService.show(
      'Request tier approval',
      `Request ${this.tierLabel(tier)} approval from your regulator for this venue?`,
      'Request'
    );
    if (!ok) return;
    this.loadingService.show('Requesting tier...');
    try {
      const r = await this.apiService.vaultDexVenueRequestTier(v.serviceAddress, tier);
      if (r?.error) this.alertService.show('Error', r.error);
      await this.loadVenue();
    } finally { this.loadingService.hide(); }
  }

  async openStateModal() {
    const v = this.venue();
    if (!v) return;
    if (v.state === 4) { this.alertService.show('Not allowed', 'Venue is deregistered (terminal state).'); return; }
    const result = await this.stateModal.show(v.state);
    if (!result) return;
    if (result.newState === 4) {
      const ok = await this.alertService.show(
        'Deactivate venue',
        'Set venue state to Deregistered? This is terminal — the venue cannot be reactivated.',
        'Deactivate'
      );
      if (!ok) return;
    }
    this.loadingService.show('Updating state...');
    try {
      const r = await this.apiService.vaultDexVenueSetState(v.serviceAddress, result.newState);
      if (r?.error) this.alertService.show('Error', r.error);
      await this.loadVenue();
    } finally { this.loadingService.hide(); }
  }
}
