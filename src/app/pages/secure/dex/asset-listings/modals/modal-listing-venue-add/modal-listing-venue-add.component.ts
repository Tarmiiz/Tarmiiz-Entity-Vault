import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../../../../../shared/services/api.service';
import { LoadingService } from '../../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../../shared/components/alerts/alert/alert.service';
import { ModalListingVenueAddService } from './modal-listing-venue-add.service';

interface AvailableVenue {
  serviceAddress: string;
  serviceName: string;
  entityAddress: string;
  entityName: string;
  countryCode: number;
  countryName: string;
  state: number;
  paymentProcessor?: string;
}

@Component({
  selector: 'app-modal-listing-venue-add',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal-listing-venue-add.component.html',
})
export class ModalListingVenueAddComponent {
  modalService = inject(ModalListingVenueAddService);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);

  search        = signal('');
  countryFilter = signal<number | ''>('');
  candidates    = signal<AvailableVenue[]>([]);
  loading       = signal(false);

  tierLabel = computed(() => {
    const t = this.modalService.input()?.tier;
    return t === 1 ? 'Tier 1 — Venue' : t === 2 ? 'Tier 2 — Country' : t === 3 ? 'Tier 3 — Global' : '';
  });

  tierHint = computed(() => {
    const inp = this.modalService.input();
    if (!inp) return '';
    if (inp.tier === 1) return 'Pick from your own entity\'s venues. The service must have an active payment processor.';
    if (inp.tier === 2) return `Add venues in ${inp.assetCountryName || 'the asset\'s country'} for country-scoped trading. The venue service must have a full-scope (level 2) payment processor.`;
    return 'Add venues anywhere globally for cross-border routing. The venue service must have a full-scope (level 2) payment processor.';
  });

  constructor() {
    effect(async () => {
      const inp = this.modalService.input();
      if (inp && this.modalService.isVisible()) {
        // Reset filters and reload when a new modal session opens.
        this.search.set('');
        this.countryFilter.set('');
        await this.reload();
      }
    });
  }

  async reload() {
    const inp = this.modalService.input();
    if (!inp) return;
    this.loading.set(true);
    try {
      const opts: { q?: string; country?: number } = {};
      if (this.search())        opts.q       = this.search();
      if (this.countryFilter()) opts.country = Number(this.countryFilter());
      const r = await this.apiService.vaultDexAssetListingVenuesAvailable(inp.asset, inp.tier, opts);
      this.candidates.set(r?.venues || []);
    } finally {
      this.loading.set(false);
    }
  }

  async add(v: AvailableVenue) {
    const inp = this.modalService.input();
    if (!inp) return;
    const ok = await this.alertService.show(
      'Enable venue',
      `Enable "${v.serviceName || v.serviceAddress}" for ${this.tierLabel()} trading on this asset?`,
      'Enable'
    );
    if (!ok) return;
    this.loadingService.show('Enabling venue...');
    let listed = false;
    try {
      const r = await this.apiService.vaultDexAssetListingVenueAdd(inp.asset, v.serviceAddress, inp.tier);
      if (r?.error) { this.alertService.show('Error', r.error); return; }
      listed = true;
    } finally {
      this.loadingService.hide();
    }
    if (!listed) return;
    // DEX settlement clears at the matched-order price by calling T20.withholdSettle with that price.
    // For that price to be honored (rather than silently pinned to the asset's setPrice), the venue
    // service must have canQuote = true on this asset. Default the prompt to yes — denying it leaves
    // the venue listed but unable to settle matched trades.
    const allowQuote = await this.alertService.show(
      'Allow venue to clear at matched price?',
      `For DEX settlement to work normally, "${v.serviceName || v.serviceAddress}" needs permission to clear trades at the matched-order price on this asset. Grant it now? (You can revoke this later from the asset's Services tab.)`,
      'Allow quoting'
    );
    if (allowQuote) {
      this.loadingService.show('Granting price-quoting permission...');
      try {
        await this.apiService.vaultSetAssetServiceCanQuote(inp.asset, v.serviceAddress, true);
      } catch (err) {
        console.error('Failed to grant canQuote', err);
        this.alertService.show(
          'Quoting permission not granted',
          'The venue is listed but cannot clear trades at the matched price yet. Open the asset\'s Services tab and toggle Price Quoting to "Allowed" before any trade is matched.'
        );
      } finally {
        this.loadingService.hide();
      }
    } else {
      this.alertService.show(
        'Heads up',
        'The venue is listed but pinned to your asset price. DEX matched-price settlement will revert until you grant quoting permission from the asset\'s Services tab.'
      );
    }
    this.modalService.hide(true);
  }

  cancel() { this.modalService.hide(false); }
}
