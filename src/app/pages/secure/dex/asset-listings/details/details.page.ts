import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";
import { ApiService } from '../../../../../shared/services/api.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { DexAssetListing, DexAssetListingVenue } from '../../../../../shared/models/data.model';

import { ModalListingVenueAddService } from '../modals/modal-listing-venue-add/modal-listing-venue-add.service';
import { ModalListingVenueAddComponent } from '../modals/modal-listing-venue-add/modal-listing-venue-add.component';

@Component({
  selector: 'app-dex-asset-listing-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, RouterLink, ModalListingVenueAddComponent],
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private addVenueModal = inject(ModalListingVenueAddService);
  utils = inject(UtilsService);

  baseAsset  = signal<string>('');
  listing    = signal<DexAssetListing | undefined>(undefined);
  activeTab  = signal<'info' | 'venues'>('info');
  selectedTier = signal<1 | 2 | 3>(1);

  enabledVenues = signal<DexAssetListingVenue[]>([]);

  venuesForTier = computed(() => this.enabledVenues().filter(v => v.tier === this.selectedTier()));

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
  setTier(t: 1 | 2 | 3) { this.selectedTier.set(t); }

  tierLabel(t: 1 | 2 | 3): string { return t === 1 ? 'Tier 1 — Venue' : t === 2 ? 'Tier 2 — Country' : 'Tier 3 — Global'; }
  tierHint(t: 1 | 2 | 3): string {
    if (t === 1) return 'Pick from your own entity\'s venues (must have a payment processor set).';
    if (t === 2) return 'Add venues in the asset\'s country for country-scoped trading. Venues need a full-scope (level 2) payment processor.';
    return 'Add venues anywhere globally for cross-border routing. Venues need a full-scope (level 2) payment processor.';
  }
  tierApprovedOnAsset(t: 1 | 2 | 3): boolean {
    const l = this.listing(); if (!l) return false;
    return t === 1 ? l.venueApproved : t === 2 ? l.countryApproved : l.globalApproved;
  }
  tierPendingOnAsset(t: 1 | 2 | 3): boolean {
    const l = this.listing(); if (!l) return false;
    return t === 1 ? l.venuePending : t === 2 ? l.countryPending : l.globalPending;
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
      tier:  this.selectedTier(),
    });
    if (ok) await this.loadEnabledVenues();
  }

  async removeVenue(v: DexAssetListingVenue) {
    const ok = await this.alertService.show(
      'Remove venue',
      `Remove "${v.dexServiceName || v.dexService}" from ${this.tierLabel(v.tier as 1 | 2 | 3)}? Open ${this.tierLabel(v.tier as 1 | 2 | 3)} orders against this venue will continue, but no new orders will place.`,
      'Remove'
    );
    if (!ok) return;
    this.loadingService.show('Removing venue...');
    try {
      const r = await this.apiService.vaultDexAssetListingVenueRemove(this.baseAsset(), v.tier, v.dexService);
      if (r?.error) this.alertService.show('Error', r.error);
      await this.loadEnabledVenues();
    } finally { this.loadingService.hide(); }
  }

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
