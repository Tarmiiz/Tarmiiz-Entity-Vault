import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";
import { ApiService } from '../../../../../shared/services/api.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { DexAssetListing, DexAssetListingVenue } from '../../../../../shared/models/data.model';

import { ModalListingVenueAddService } from '../modals/modal-listing-venue-add/modal-listing-venue-add.service';
import { ModalListingVenueAddComponent } from '../modals/modal-listing-venue-add/modal-listing-venue-add.component';
import { ModalListingVenueTierChangeService } from '../modals/modal-listing-venue-tier-change/modal-listing-venue-tier-change.service';
import { ModalListingVenueTierChangeComponent } from '../modals/modal-listing-venue-tier-change/modal-listing-venue-tier-change.component';

@Component({
  selector: 'app-dex-asset-listing-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, RouterLink, ModalListingVenueAddComponent, ModalListingVenueTierChangeComponent, TranslatePipe],
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private addVenueModal = inject(ModalListingVenueAddService);
  private tierChangeModal = inject(ModalListingVenueTierChangeService);
  utils = inject(UtilsService);
  private authService = inject(AuthService);

  get userInfo() { return this.authService.userInfo; }

  baseAsset  = signal<string>('');
  listing    = signal<DexAssetListing | undefined>(undefined);
  activeTab  = signal<'info' | 'venues'>('info');
  // Initial tier presented in the Add Venue modal (only used at add time; tier is mutable afterwards).
  addInitialTier = signal<1 | 2 | 3>(1);

  enabledVenues = signal<DexAssetListingVenue[]>([]);

  constructor() {
    const asset = this.route.snapshot.paramMap.get('asset');
    if (asset) this.baseAsset.set(asset);
  }

  ngOnInit() {}

  async ionViewWillEnter() {
    await this.loadListing();
    await this.loadEnabledVenues();
  }

  setTab(tab: 'info' | 'venues') { this.activeTab.set(tab); }
  setAddInitialTier(t: 1 | 2 | 3) { this.addInitialTier.set(t); }

  tierLabel(t: number): string {
    return t === 1 ? 'Tier 1 — Venue' : t === 2 ? 'Tier 2 — Country' : t === 3 ? 'Tier 3 — Global' : '—';
  }
  tierApprovedOnAsset(t: 1 | 2 | 3): boolean {
    const l = this.listing(); if (!l) return false;
    return t === 1 ? l.venueApproved : t === 2 ? l.countryApproved : l.globalApproved;
  }
  tierPendingOnAsset(t: 1 | 2 | 3): boolean {
    const l = this.listing(); if (!l) return false;
    return t === 1 ? l.venuePending : t === 2 ? l.countryPending : l.globalPending;
  }
  tierBadgeClass(t: number): string {
    return t === 1 ? 'bg-indigo-100 text-indigo-800'
         : t === 2 ? 'bg-blue-100 text-blue-800'
         : t === 3 ? 'bg-purple-100 text-purple-800'
         : 'bg-gray-100 text-gray-800';
  }
  // Returns a short "why is this listing blocked" reason from the cached upstream snapshot.
  // Empty string means upstream is healthy (still subject to per-tier listing/venue approval gates).
  upstreamBlockReason(): string {
    const l = this.listing(); if (!l) return '';
    const u = l.upstream;
    if (u && u.issuerEntityState && u.issuerEntityState !== 2) return 'Trading blocked — issuer entity not active';
    if (u && !u.assetTradable && u.syncedAt) return 'Trading blocked — asset suspended or inactive';
    return '';
  }

  async loadListing() {
    this.loadingService.show('Loading listing...');
    try {
      const data = await this.apiService.vaultDexAssetListingInfo(this.baseAsset());
      this.listing.set(data);
    } finally { this.loadingService.hide(); }
  }

  async loadEnabledVenues() {
    const r = await this.apiService.vaultDexAssetListingVenues(this.baseAsset());
    this.enabledVenues.set(r?.venues || []);
  }

  async openAdd() {
    const ok = await this.addVenueModal.show({
      asset: this.baseAsset(),
      tier:  this.addInitialTier(),
    });
    if (ok) await this.loadEnabledVenues();
  }

  async openTierChange(v: DexAssetListingVenue) {
    const l = this.listing();
    if (!l) return;
    const ok = await this.tierChangeModal.show({
      asset:   this.baseAsset(),
      listing: l,
      venue:   v,
    });
    if (ok) await this.loadEnabledVenues();
  }

  async removeVenue(v: DexAssetListingVenue) {
    const ok = await this.alertService.show(
      'Remove venue',
      `Remove "${v.dexServiceName || v.dexService}" from this listing? Open orders against this venue will continue, but no new orders will place.`,
      'Remove'
    );
    if (!ok) return;
    this.loadingService.show('Removing venue...');
    try {
      const r = await this.apiService.vaultDexAssetListingVenueRemove(this.baseAsset(), v.dexService);
      if (r?.error) this.alertService.show('Error', r.error);
      await this.loadEnabledVenues();
    } finally { this.loadingService.hide(); }
  }

  goVenue(address: string) { this.router.navigate(['/authorized/dex/venues/details/' + address]); }

  getStateClass(s: number): string {
    switch (Number(s)) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
}
