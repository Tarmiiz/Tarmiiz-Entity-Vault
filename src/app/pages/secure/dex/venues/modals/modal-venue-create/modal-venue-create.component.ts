import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalVenueCreateService } from './modal-venue-create.service';
import { ApiService } from '../../../../../../shared/services/api.service';
import { MARKET_CLASS } from '../../../../../../shared/constants/market-class';

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

  form = this.fb.group({
    serviceAddress: ['', Validators.required],
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
        .filter((s: any) => Number(s.market_class ?? s.marketClass ?? 0) === MARKET_CLASS.EXCHANGE)
        .map((s: any) => ({
          address:  s.address,
          name:     s.name || s.address,
          // The API coerces this column to a real boolean on `/vault/services`, so `=== true`
          // is safe here; the `== 1` leg covers a raw row reaching this picker some other way.
          eligible: (s.market_class_confirmed ?? s.marketClassConfirmed) === true
                 || Number(s.market_class_confirmed ?? s.marketClassConfirmed ?? 0) === 1,
        })),
    );
  }

  onSave(): void {
    if (this.form.valid) {
      this.modalService.confirm(this.form.get('serviceAddress')?.value || '');
      this.form.reset({ serviceAddress: '' });
    }
  }

  onCancel(): void {
    this.modalService.cancel();
    this.form.reset({ serviceAddress: '' });
  }
}
