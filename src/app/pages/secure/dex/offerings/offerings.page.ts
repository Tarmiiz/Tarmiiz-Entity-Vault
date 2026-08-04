import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { DexOffering, DexOfferingFill, User } from '../../../../shared/models/data.model';

interface AssetOption { address: string; name: string; symbol: string; }
interface VenueOption { dexService: string; serviceName: string; state: number; }

/**
 * DEX Offerings — the issuer-side IPO facility (issuer/DEX model C1, 2026-08-03).
 * The issuer opens a standing TAP (fixed price, reserve-escrowed for Fixed supply)
 * on a regulator-approved (asset, venue) pairing; the ASSET's regulator then
 * approves each offering from its own dashboard before it goes live. Venue fees
 * are frozen into the offering at create time.
 */
@Component({
  selector: 'app-dex-offerings',
  templateUrl: './offerings.page.html',
  styleUrls: ['./offerings.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, TranslatePipe],
})
export class OfferingsPage implements OnInit {
  private apiService     = inject(ApiService);
  private authService    = inject(AuthService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);
  utils = inject(UtilsService);
  features = inject(FeaturesService);

  userInfo!: User;

  offerings = signal<DexOffering[]>([]);
  offeringsTotal = signal(0);
  loaded = signal(false);

  // Per-offering fills expand.
  expandedKey = signal<string>('');
  fills = signal<DexOfferingFill[]>([]);

  // ── Create-offering modal state ───────────────────────────────────────────
  createModalOpen = signal(false);
  myAssets = signal<AssetOption[]>([]);
  assetVenues = signal<VenueOption[]>([]);
  createAsset = '';
  createVenue = '';
  createPrice = '';
  createAmount = '';
  createMinFill = '';
  createMaxPerSubscription = '';

  ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      await this.loadOfferings();
    } finally {
      this.loadingService.hide();
      this.loaded.set(true);
    }
  }

  private async loadOfferings() {
    const data = await this.apiService.vaultDexOfferingsList({ start: 0, offset: 200 });
    this.offerings.set(data?.offerings ?? []);
    this.offeringsTotal.set(data?.totalCount ?? 0);
  }

  canAct(): boolean {
    return !!this.userInfo && this.userInfo.role !== 3;
  }

  statusName(status: number): string {
    switch (Number(status)) {
      case 1: return this.translate.instant('dexOfferings.status.pending');
      case 2: return this.translate.instant('dexOfferings.status.live');
      case 6: return this.translate.instant('dexOfferings.status.completed');
      case 7: return this.translate.instant('dexOfferings.status.cancelled');
      case 8: return this.translate.instant('dexOfferings.status.rejected');
      default: return String(status);
    }
  }

  statusClass(status: number): string {
    switch (Number(status)) {
      case 1: return 'bg-amber-100 text-amber-800';
      case 2: return 'bg-green-100 text-green-800';
      case 6: return 'bg-blue-100 text-blue-800';
      case 7: return 'bg-gray-200 text-gray-600';
      case 8: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  remaining(o: DexOffering): number {
    return Math.max(0, Number(o.amount) - Number(o.sold));
  }

  shortKey(key: string): string {
    if (!key || key.length < 16) return key || '';
    return `${key.slice(0, 10)}…${key.slice(-6)}`;
  }

  async toggleFills(o: DexOffering) {
    if (this.expandedKey() === o.offeringKey) {
      this.expandedKey.set('');
      this.fills.set([]);
      return;
    }
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      const data = await this.apiService.vaultDexOfferingInfo(o.offeringKey);
      this.fills.set(data?.fills ?? []);
      this.expandedKey.set(o.offeringKey);
    } finally {
      this.loadingService.hide();
    }
  }

  // ── Create offering ───────────────────────────────────────────────────────
  async openCreateModal() {
    this.createAsset = '';
    this.createVenue = '';
    this.createPrice = '';
    this.createAmount = '';
    this.createMinFill = '';
    this.createMaxPerSubscription = '';
    this.assetVenues.set([]);
    this.createModalOpen.set(true);
    if (this.myAssets().length === 0) {
      const data = await this.apiService.vaultGetAssets(0, 200);
      this.myAssets.set((data?.assets ?? []).map((a: any) => ({
        address: a.address, name: a.name ?? '', symbol: a.symbol ?? '',
      })));
    }
  }

  // The venue picker offers the selected asset's listing venues — an offering needs
  // the (asset, venue) pairing regulator-approved (state 2), so only those qualify.
  async onCreateAssetChange() {
    this.createVenue = '';
    this.assetVenues.set([]);
    if (!this.createAsset) return;
    const data = await this.apiService.vaultDexAssetListingVenues(this.createAsset);
    const rows = Array.isArray(data?.venues) ? data.venues : [];
    this.assetVenues.set(rows
      .filter((v: any) => Number(v.state ?? 1) === 2)
      .map((v: any) => ({
        dexService: v.dexService,
        serviceName: v.dexServiceName || v.dexService,
        state: Number(v.state ?? 1),
      })));
  }

  async submitCreate() {
    if (!this.createAsset || !this.createVenue || !Number(this.createPrice) || !Number(this.createAmount)) return;
    this.createModalOpen.set(false);
    this.loadingService.show(this.translate.instant('dexOfferings.creating'));
    try {
      const res = await this.apiService.vaultDexOfferingCreate({
        baseAsset: this.createAsset,
        dexService: this.createVenue,
        price: String(this.createPrice),
        amount: String(Math.floor(Number(this.createAmount))),
        minFill: Math.floor(Number(this.createMinFill)) || 0,
        maxPerSubscription: Math.floor(Number(this.createMaxPerSubscription)) || 0,
        refNo: '',
      });
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.loadOfferings();
        this.alertService.show(
          this.translate.instant('dexOfferings.createdTitle'),
          this.translate.instant('dexOfferings.createdMessage'),
          this.translate.instant('alerts.ok'),
        );
      }
    } finally {
      this.loadingService.hide();
    }
  }

  async cancelOffering(o: DexOffering) {
    const confirmed = await this.alertService.show(
      this.translate.instant('dexOfferings.cancelTitle'),
      this.translate.instant('dexOfferings.cancelMessage'),
      this.translate.instant('alerts.ok'),
    );
    if (!confirmed) return;
    this.loadingService.show(this.translate.instant('dexOfferings.cancelling'));
    try {
      const res = await this.apiService.vaultDexOfferingCancel(o.offeringKey, '');
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.loadOfferings();
      }
    } finally {
      this.loadingService.hide();
    }
  }
}
