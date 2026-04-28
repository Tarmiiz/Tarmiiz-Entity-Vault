import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

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
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal-listing-venue-tier-change.component.html',
})
export class ModalListingVenueTierChangeComponent {
  modalService = inject(ModalListingVenueTierChangeService);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);

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
      if (!listingApproved) reasons.push(`Listing tier ${t} not approved by asset regulator`);
      if (!venueApproved)   reasons.push(`Venue tier ${t} not approved by venue regulator`);
      if (venue.venueSuspended) reasons.push('Venue suspended by regulator');
      if (Number(venue.venueState) !== 2) reasons.push('Venue not active');
      if (Number(venue.tier) === t) reasons.push('Already at this tier');
      return {
        tier: t,
        label: t === 1 ? 'Tier 1 — Venue' : t === 2 ? 'Tier 2 — Country' : 'Tier 3 — Global',
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
    const ok = await this.alertService.show(
      'Change venue tier',
      `Change "${inp.venue.dexServiceName || inp.venue.dexService}" to ${t === 1 ? 'Tier 1 — Venue' : t === 2 ? 'Tier 2 — Country' : 'Tier 3 — Global'} on this listing?`,
      'Change'
    );
    if (!ok) return;
    this.loadingService.show('Changing venue tier...');
    try {
      const r = await this.apiService.vaultDexAssetListingVenueSetTier(inp.asset, inp.venue.dexService, t);
      if (r?.error) { this.alertService.show('Error', r.error); return; }
      this.modalService.hide(true);
    } finally {
      this.loadingService.hide();
    }
  }

  cancel() { this.modalService.hide(false); }
}
