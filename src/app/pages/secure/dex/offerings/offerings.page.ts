import { Component, OnInit, signal, inject, computed } from '@angular/core';
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
import { DexOffering, User } from '../../../../shared/models/data.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { PaginatorComponent, pageSlice } from '../../../../shared/components/paginator/paginator.component';

interface AssetOption { address: string; name: string; symbol: string; }
interface VenueOption { dexService: string; serviceName: string; state: number; }
interface SubscriptionOption { address: string; label: string; }

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
  imports: [CommonModule, FormsModule, HeaderComponent, TranslatePipe, MoneyPipe, PaginatorComponent],
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
  /** 1-based, per frontend Standard 1.5. */
  offeringsPage = signal(1);
  offeringsPageSize = signal(25);
  pagedOfferings = computed(() => pageSlice(this.offerings(), this.offeringsPage(), this.offeringsPageSize()));
  offeringsTotal = signal(0);
  loaded = signal(false);

  // NOTE: there is no per-offering fills list here. A fill IS a transaction — the tap
  // writes an Assets-registry subscribe row (plus its credit legs), so it shows on the
  // Transactions page like every other subscribe. A second per-offering table restated
  // the same rows in a place nobody would think to reconcile against.

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

  // ── Buy (fill) modal state ────────────────────────────────────────────────
  buyModalOpen = signal(false);
  buyOffering = signal<DexOffering | null>(null);
  mySubscriptions = signal<SubscriptionOption[]>([]);
  buySubscription = '';
  buyAmount = '';

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

  // The offering key is a bytes32 that every API call against the offering needs
  // (notably POST /dex/offerings/:key/fill), and the table can only show it
  // truncated. A hover title is not selectable, so the cell is a copy button —
  // same pattern as the document CID / SHA-256 cells.
  async copyToClipboard(value: string | null) {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); } catch { /* clipboard unavailable */ }
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
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.loadOfferings();
        this.alertService.info(
          this.translate.instant('dexOfferings.createdTitle'),
          this.translate.instant('dexOfferings.createdMessage'),
          this.translate.instant('alerts.ok'),
        );
      }
    } finally {
      this.loadingService.hide();
    }
  }

  // ── Buy from an offering (primary issuance) ───────────────────────────────
  //
  // Deliberately NOT gated to the brokerage entity mode. Buying for a client is the
  // brokerage's defining act, but the endpoint admits ANY entity whose subscription is
  // admitted at the venue — a token issuer taking another issuer's new issue for its own
  // subscribers is legitimate, and a mode gate would hide it with no on-chain rule behind it.
  //
  // The offering is chosen by the ROW, not a second asset picker: an asset picker could
  // offer an asset that has no live offering, which is not a state the user can act on.
  canBuy(o: DexOffering): boolean {
    return Number(o.status) === 2 && !o.suspended && this.remaining(o) > 0
      && this.canAct() && this.features.systemFunctionEnabled('dex-offering-fill');
  }

  async openBuyModal(o: DexOffering) {
    this.buyOffering.set(o);
    this.buySubscription = '';
    this.buyAmount = '';
    this.buyModalOpen.set(true);
    if (this.mySubscriptions().length === 0) {
      const data = await this.apiService.vaultGetSubscriptions(undefined, 0, 500);
      // `vaultGetSubscriptions` returns RAW mirror rows, not mapped Subscription models:
      // the subscription address is `address` (not `subscription`) and the joined names
      // are snake_case. Getting either wrong yields options with an empty value, which
      // silently disables Buy.
      //
      // Active + unsuspended only — the chain rejects the rest, and offering a row that
      // can only fail is worse than omitting it.
      //
      // Labelled by FULL address: a brokerage's subscriptions all sit under the same
      // service, so the service name alone cannot tell two clients apart, and there is no
      // subscriber name to fall back on (the DID is deliberately never exposed here).
      // Misidentifying which client a purchase is booked against is not a recoverable error.
      this.mySubscriptions.set((data?.subscriptions ?? [])
        .filter((s: any) => Number(s.state) === 2 && !s.suspended)
        .map((s: any) => ({
          address: s.address,
          label: s.service_name ? `${s.address} · ${s.service_name}` : s.address,
        })));
    }
  }

  /** Gross cost preview = amount × the offering's frozen price. Venue fees are zero-bps here. */
  buyGross(): number {
    const o = this.buyOffering();
    const n = Number(this.buyAmount);
    if (!o || !(n > 0)) return 0;
    return n * Number(o.price);
  }

  /**
   * Client-side twin of the API's pre-checks — same limits, so the user is told before a
   * round trip. The server re-checks and the contract is the boundary; this is UX only.
   */
  buyError(): string {
    const o = this.buyOffering();
    if (!o) return '';
    const n = Number(this.buyAmount);
    if (!this.buyAmount) return '';
    if (!(n > 0) || !Number.isInteger(n)) return this.translate.instant('dexOfferings.buyModal.errAmount');
    const rem = this.remaining(o);
    if (n > rem) return this.translate.instant('dexOfferings.buyModal.errRemaining', { remaining: rem });
    // minFill is waived when taking the exact remainder — mirrors the contract.
    if (Number(o.minFill) > 0 && n !== rem && n < Number(o.minFill)) {
      return this.translate.instant('dexOfferings.buyModal.errMinFill', { minFill: Number(o.minFill) });
    }
    if (Number(o.maxPerSubscription) > 0 && n > Number(o.maxPerSubscription)) {
      return this.translate.instant('dexOfferings.buyModal.errMaxPerSub', { max: Number(o.maxPerSubscription) });
    }
    return '';
  }

  buyDisabled(): boolean {
    return !this.buySubscription || !this.buyAmount || !!this.buyError();
  }

  async submitBuy() {
    const o = this.buyOffering();
    if (!o || this.buyDisabled()) return;
    this.buyModalOpen.set(false);
    this.loadingService.show(this.translate.instant('dexOfferings.buying'));
    try {
      const res = await this.apiService.vaultDexOfferingFill(o.offeringKey, {
        subscription: this.buySubscription,
        amount: String(Math.floor(Number(this.buyAmount))),
      });
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
        return;
      }
      await this.loadOfferings();
      this.alertService.info(
        this.translate.instant('dexOfferings.buyModal.doneTitle'),
        this.translate.instant('dexOfferings.buyModal.doneMessage', { amount: res?.amount ?? '', gross: res?.gross ?? '' }),
        this.translate.instant('alerts.ok'),
      );
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
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.loadOfferings();
      }
    } finally {
      this.loadingService.hide();
    }
  }
}
