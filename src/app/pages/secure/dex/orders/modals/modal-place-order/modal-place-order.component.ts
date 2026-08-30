import { Component, ChangeDetectionStrategy, computed, effect, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { ethers } from 'ethers';

import { ApiService } from '../../../../../../shared/services/api.service';
import { ModalPlaceOrderService } from './modal-place-order.service';
import { DexAssetListing, DexVenue } from '../../../../../../shared/models/data.model';

@Component({
  selector: 'app-modal-place-order',
  templateUrl: './modal-place-order.component.html',
  styleUrls: ['./modal-place-order.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
})
export class ModalPlaceOrderComponent {
  modalService = inject(ModalPlaceOrderService);
  private apiService = inject(ApiService);

  step = signal<number>(1);
  totalSteps = 3;

  subscriptions = signal<any[]>([]);
  venues = signal<DexVenue[]>([]);
  listings = signal<DexAssetListing[]>([]);

  subscription = signal<string>('');
  dexService = signal<string>('');
  baseAsset = signal<string>('');
  side = signal<number>(1);
  priceText = signal<string>('');
  amountText = signal<string>('');
  // Time in force (2026-08-11). `expiryLocal` is a datetime-local string in the OPERATOR's
  // timezone; `tif` picks whether it is used at all. Default GTC — the behaviour every order
  // had before this, so an operator who ignores the control gets exactly what they got before.
  tif = signal<'gtc' | 'gtd'>('gtc');
  expiryLocal = signal<string>('');
  reviewConfirmed = signal<boolean>(false);

  constructor() {
    effect(() => {
      if (this.modalService.isVisible()) this.load();
    });
  }

  async load() {
    const subsResult = await this.apiService.vaultGetSubscriptions(undefined, 0, 200);
    if (subsResult?.subscriptions) this.subscriptions.set(subsResult.subscriptions);
    const venuesResult = await this.apiService.vaultDexVenuesList(1, 200);
    if (venuesResult?.venues) this.venues.set((venuesResult.venues as DexVenue[]).filter(v => Number(v.state) === 2 && !v.suspended));
    const listingsResult = await this.apiService.vaultDexAssetListingsList(1, 200);
    if (listingsResult?.listings) this.listings.set(listingsResult.listings);
  }

  scopeApproved(l: DexAssetListing | undefined, scope: number): boolean {
    if (!l) return false;
    if (scope === 1) return !!l.venueApproved;
    if (scope === 2) return !!l.countryApproved;
    if (scope === 3) return !!l.globalApproved;
    return false;
  }

  approvedListings = computed(() =>
    this.listings().filter(l => l.venueApproved || l.countryApproved || l.globalApproved)
  );

  selectedListing = computed(() =>
    this.listings().find(l => l.baseAsset?.toLowerCase() === this.baseAsset().toLowerCase())
  );

  availableScopes = computed<number[]>(() => {
    const l = this.selectedListing();
    if (!l) return [];
    const out: number[] = [];
    if (l.venueApproved)   out.push(1);
    if (l.countryApproved) out.push(2);
    if (l.globalApproved)  out.push(3);
    return out;
  });

  scopeName(s: number): string {
    return s === 1 ? 'Tier 1 — Venue' : s === 2 ? 'Tier 2 — Country' : 'Tier 3 — Global';
  }

  isStep1Valid = computed(() => !!(this.subscription() && this.dexService() && this.baseAsset()));
  /**
   * Unix SECONDS for the chain, or 0 for GTC. `datetime-local` has no timezone, so
   * `new Date(value)` reads it as LOCAL time — which is what the operator typed — and
   * `getTime()` normalises to UTC. Anything unparseable yields 0 rather than NaN, and the
   * validity check below is what stops a blank GTD from silently placing a GTC order.
   */
  expiresAtSeconds = computed<number>(() => {
    if (this.tif() !== 'gtd') return 0;
    const raw = this.expiryLocal();
    if (!raw) return 0;
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  });

  /** Shown inline so the operator sees the refusal before submitting, not as a revert. */
  expiryError = computed<string>(() => {
    if (this.tif() !== 'gtd') return '';
    if (!this.expiryLocal()) return 'dex.orders.place.expiryRequired';
    const secs = this.expiresAtSeconds();
    if (!secs) return 'dex.orders.place.expiryInvalid';
    if (secs <= Math.floor(Date.now() / 1000)) return 'dex.orders.place.expiryPast';
    return '';
  });

  isStep2Valid = computed(() => {
    const p = Number(this.priceText());
    const a = Number(this.amountText());
    return (this.side() === 1 || this.side() === 2) && p > 0 && a > 0 && !this.expiryError();
  });

  next() {
    if (this.step() === 1 && !this.isStep1Valid()) return;
    if (this.step() === 2 && !this.isStep2Valid()) return;
    this.step.update(s => Math.min(this.totalSteps, s + 1));
  }
  prev() { this.step.update(s => Math.max(1, s - 1)); }

  pickAssetByAddress(addr: string) {
    this.baseAsset.set(addr);
    const scopes = this.availableScopes();
  }

  setVenue(addr: string) { this.dexService.set(addr); }
  setSubscription(addr: string) { this.subscription.set(addr); }

  /**
   * The review step showed a raw 0x address while the picker above it showed a name, so an
   * operator confirming a trade could not tell WHICH client they were about to trade for.
   * Same fallback chain as the picker; the address remains the last resort.
   */
  subscriptionLabel = computed(() => {
    const addr = this.subscription();
    const s = this.subscriptions().find((x: any) => x.subscription === addr);
    if (!s) return addr;
    const who = s.subscriberName || s.identityName || addr;
    const svc = s.serviceName || (s.service ? s.service.slice(0, 10) + String.fromCharCode(8230) : '');
    return svc ? who + ' — ' + svc : who;
  });

  estimatedTotal = computed(() => {
    const p = Number(this.priceText());
    const a = Number(this.amountText());
    if (!p || !a) return '—';
    return (p * a).toLocaleString(undefined, { maximumFractionDigits: 6 });
  });

  selectedListingCurrency = computed(() => this.selectedListing()?.assetCurrencyName || '');

  onSave() {
    if (!this.reviewConfirmed()) return;
    let priceWei: string;
    try { priceWei = ethers.parseEther(this.priceText() || '0').toString(); }
    catch { return; }
    this.modalService.confirm({
      subscription: this.subscription(),
      dexService:   this.dexService(),
      baseAsset:    this.baseAsset(),
      side:         this.side(),
      price:        priceWei,
      amount:       String(BigInt(Math.floor(Number(this.amountText())))),
      // Unix SECONDS; 0 = good-till-cancelled. Deliberately NOT milliseconds — the API and the
      // chain both take seconds here, while the mirror reports the order's expiry back in ms.
      expiresAt:    this.expiresAtSeconds(),
    });
    this.reset();
  }

  onCancel() {
    this.modalService.cancel();
    this.reset();
  }

  private reset() {
    this.step.set(1);
    this.tif.set('gtc');
    this.expiryLocal.set('');
    this.subscription.set('');
    this.dexService.set('');
    this.baseAsset.set('');
    this.side.set(1);
    this.priceText.set('');
    this.amountText.set('');
    this.reviewConfirmed.set(false);
  }
}
