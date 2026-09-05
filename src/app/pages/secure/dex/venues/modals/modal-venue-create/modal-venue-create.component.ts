import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalVenueCreateService } from './modal-venue-create.service';
import { ApiService } from '../../../../../../shared/services/api.service';

/** One row of the service picker. `eligible` decides selectable vs. shown-and-disabled. */
interface VenueServiceOption {
  address: string;
  name: string;
  eligible: boolean;
}

@Component({
  selector: 'app-modal-venue-create',
  templateUrl: './modal-venue-create.component.html',
  styleUrls: ['./modal-venue-create.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalVenueCreateComponent {
  modalService = inject(ModalVenueCreateService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  services = signal<VenueServiceOption[]>([]);
  /** True while any Exchange service is still awaiting its regulator's confirmation. */
  hasPending = computed(() => this.services().some(s => !s.eligible));

  // ⚠️ `settlementMode` starts EMPTY and is `required` — there is deliberately no default.
  //
  // It is IMMUTABLE at `venueCreate` (DEXVenueLib.venueCreate), and mode 2 additionally
  // requires an escrow clearing house attached to the service at EVERY placement
  // (DEXVenueLib.escrowAgent, reached from DEXOrderLib), so a wrong pick cannot be corrected
  // — it can only be abandoned by creating another service. A pre-selected value would be a
  // permanent decision made by a default.
  form = this.fb.group({
    serviceAddress: ['', Validators.required],
    settlementMode: ['', Validators.required],
  });

  constructor() {
    this.loadServices();
  }

  // ⚠️ `serviceType === 1` IS NOT THE GATE, and filtering on it alone is what made this
  // picker offer services the chain refuses. `DEXVenueLib.venueCreate` requires BOTH:
  //
  //     require(svcInfo.marketClass == MC_EXCHANGE,  "DEXProxy: venue service must be an Exchange");
  //     require(svcInfo.marketClassConfirmed,        "DEXProxy: market class is not regulator-confirmed");
  //
  // Issuer (1) and Brokerage (3) are ALSO type-1, so they were offered and reverted; and the
  // confirmation is the whole point of the field — `marketClass` is entity-DECLARED, so
  // trusting it here would mean the applicant opening the gate it is measured against.
  //
  // Unconfirmed Exchanges are LISTED AND DISABLED rather than dropped. An entity that has
  // declared Exchange and is waiting on its regulator would otherwise open an empty picker
  // with nothing to explain it — "confirmation pending" is the answer it needs. Issuer and
  // Brokerage services are dropped outright: they are not awaiting anything.
  async loadServices() {
    const data = await this.apiService.vaultGetServices(0, 1000);
    const list = data?.services ?? [];
    this.services.set(
      list
        // ⚠️ ONE LICENSE TEST REPLACES THE PAIR (Phase 28 step (e), 2026-09-03). The chain gate
        // this mirrors was `marketClass == MC_EXCHANGE` AND `marketClassConfirmed`; it is now the
        // single `hasLicense(service, 28)`, because a license is Active precisely BECAUSE a
        // regulator approved it — the confirmation flag has no successor and needs none.
        //
        // ⚠️ AND THE "LISTED BUT DISABLED" STATE GOES WITH IT. The old picker showed an
        // unconfirmed Exchange greyed out so an entity waiting on its regulator saw an answer
        // rather than an empty list. There is no equivalent here: a REQUESTED license is not
        // visible through `hasLicense`, and surfacing one would mean reading `licensesOf`, which
        // returns Denied and Revoked too — publishing "pending" for a license that was refused.
        // An empty picker is the honest outcome; the license request's own status page is where
        // that question belongs.
        .filter((s: any) => ((s.licenses ?? []) as number[]).includes(28))
        .map((s: any) => ({
          address:  s.address,
          name:     s.name || s.address,
          // Every listed service is eligible now: holding the license IS the eligibility, so
          // there is no second condition to test. Kept as a field so the template needs no change.
          eligible: true,
        })),
    );
  }

  onSave(): void {
    if (this.form.valid) {
      this.modalService.confirm(
        this.form.get('serviceAddress')?.value || '',
        Number(this.form.get('settlementMode')?.value),
      );
      this.form.reset({ serviceAddress: '', settlementMode: '' });
    }
  }

  onCancel(): void {
    this.modalService.cancel();
    this.form.reset({ serviceAddress: '', settlementMode: '' });
  }
}
