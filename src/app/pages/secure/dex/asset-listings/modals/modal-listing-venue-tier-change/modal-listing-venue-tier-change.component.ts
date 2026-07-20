import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ApiService } from '../../../../../../shared/services/api.service';
import { LoadingService } from '../../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../../shared/components/alerts/alert/alert.service';
import { ModalListingVenueTierChangeService } from './modal-listing-venue-tier-change.service';

interface TierOption {
  tier: 1 | 2 | 3;
  label: string;
  enabled: boolean;
  reason: string;
}

@Component({
  selector: 'app-modal-listing-venue-tier-change',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal-listing-venue-tier-change.component.html',
})
export class ModalListingVenueTierChangeComponent {
  modalService = inject(ModalListingVenueTierChangeService);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);

  selectedTier = signal<1 | 2 | 3 | null>(null);

  // Mirror the contract's five regulator-approval gates per tier so the user sees
  // exactly why a forbidden tier is disabled before submitting.
  options = computed<TierOption[]>(() => {
    const inp = this.modalService.input();
    if (!inp) return [];
    const { listing, venue } = inp;
    return ([1, 2, 3] as const).map(t => {
      const reasons: string[] = [];
      const listingApproved = t === 1 ? listing.venueApproved : t === 2 ? listing.countryApproved : listing.globalApproved;
      const venueApproved   = t === 1 ? venue.tier1Approved   : t === 2 ? venue.tier2Approved   : venue.tier3Approved;
      if (!listingApproved) reasons.push(this.translate.instant('dex.listings.changeTierModal.reasons.listingTierNotApproved', { tier: t }));
      if (!venueApproved)   reasons.push(this.translate.instant('dex.listings.changeTierModal.reasons.venueTierNotApproved', { tier: t }));
      if (venue.venueSuspended) reasons.push(this.translate.instant('dex.listings.changeTierModal.reasons.venueSuspended'));
      if (Number(venue.venueState) !== 2) reasons.push(this.translate.instant('dex.listings.changeTierModal.reasons.venueNotActive'));
      if (Number(venue.tier) === t) reasons.push(this.translate.instant('dex.listings.changeTierModal.reasons.alreadyAtTier'));
      return {
        tier: t,
        label: t === 1 ? this.translate.instant('dex.listings.tierLabels.tier1') : t === 2 ? this.translate.instant('dex.listings.tierLabels.tier2') : this.translate.instant('dex.listings.tierLabels.tier3'),
        enabled: reasons.length === 0,
        reason: reasons.join(' · '),
      };
    });
  });

  pick(t: 1 | 2 | 3, enabled: boolean) {
    if (!enabled) return;
    this.selectedTier.set(t);
  }

  async submit() {
    const inp = this.modalService.input();
    const t   = this.selectedTier();
    if (!inp || !t) return;
    const tierLabel = t === 1 ? this.translate.instant('dex.listings.tierLabels.tier1') : t === 2 ? this.translate.instant('dex.listings.tierLabels.tier2') : this.translate.instant('dex.listings.tierLabels.tier3');
    const ok = await this.alertService.show(
      this.translate.instant('dex.listings.changeTierModal.heading'),
      this.translate.instant('dex.listings.changeTierModal.confirmMessage', { name: inp.venue.dexServiceName || inp.venue.dexService, tier: tierLabel }),
      this.translate.instant('dex.listings.changeTierModal.changeButton')
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('dex.listings.changeTierModal.changingVenueTier'));
    try {
      const r = await this.apiService.vaultDexAssetListingVenueSetTier(inp.asset, inp.venue.dexService, t);
      if (r?.error) { this.alertService.show(this.translate.instant('alerts.error'), r.error); return; }
      this.modalService.hide(true);
    } finally {
      this.loadingService.hide();
    }
  }

  cancel() { this.modalService.hide(false); }
}
