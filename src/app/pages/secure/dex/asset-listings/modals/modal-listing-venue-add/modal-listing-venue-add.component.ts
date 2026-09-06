import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

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
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal-listing-venue-add.component.html',
})
export class ModalListingVenueAddComponent {
  modalService = inject(ModalListingVenueAddService);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);

  search        = signal('');
  countryFilter = signal<number | ''>('');
  candidates    = signal<AvailableVenue[]>([]);
  loading       = signal(false);

  tierLabel = computed(() => {
    const t = this.modalService.input()?.tier;
    return t === 1 ? this.translate.instant('dex.listings.tierLabels.tier1')
         : t === 2 ? this.translate.instant('dex.listings.tierLabels.tier2')
         : t === 3 ? this.translate.instant('dex.listings.tierLabels.tier3')
         : '';
  });

  tierHint = computed(() => {
    const inp = this.modalService.input();
    if (!inp) return '';
    if (inp.tier === 1) return this.translate.instant('dex.listings.addVenueModal.tier1Hint');
    if (inp.tier === 2) return this.translate.instant('dex.listings.addVenueModal.tier2Hint', {
      country: inp.assetCountryName || this.translate.instant('dex.listings.addVenueModal.assetCountryFallback')
    });
    return this.translate.instant('dex.listings.addVenueModal.tier3Hint');
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
      this.translate.instant('dex.listings.addVenueModal.enableVenueTitle'),
      this.translate.instant('dex.listings.addVenueModal.enableVenueMessage', { name: v.serviceName || v.serviceAddress, tier: this.tierLabel() }),
      this.translate.instant('dex.listings.addVenueModal.enableButton')
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('dex.listings.addVenueModal.enablingVenue'));
    let listed = false;
    try {
      const r = await this.apiService.vaultDexAssetListingVenueAdd(inp.asset, v.serviceAddress, inp.tier);
      if (r?.error) { this.alertService.info(this.translate.instant('alerts.error'), r.error); return; }
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
      this.translate.instant('dex.listings.addVenueModal.allowQuoteTitle'),
      this.translate.instant('dex.listings.addVenueModal.allowQuoteMessage', { name: v.serviceName || v.serviceAddress }),
      this.translate.instant('dex.listings.addVenueModal.allowQuotingButton')
    );
    if (allowQuote) {
      this.loadingService.show(this.translate.instant('dex.listings.addVenueModal.grantingQuotingPermission'));
      try {
        await this.apiService.vaultSetAssetServiceCanQuote(inp.asset, v.serviceAddress, true);
      } catch (err) {
        console.error('Failed to grant canQuote', err);
        this.alertService.info(
          this.translate.instant('dex.listings.addVenueModal.quotingNotGrantedTitle'),
          this.translate.instant('dex.listings.addVenueModal.quotingNotGrantedMessage')
        );
      } finally {
        this.loadingService.hide();
      }
    } else {
      this.alertService.info(
        this.translate.instant('dex.listings.addVenueModal.headsUpTitle'),
        this.translate.instant('dex.listings.addVenueModal.headsUpMessage')
      );
    }
    this.modalService.hide(true);
  }

  cancel() { this.modalService.hide(false); }
}
