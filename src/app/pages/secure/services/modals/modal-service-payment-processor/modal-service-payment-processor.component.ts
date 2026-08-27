import { Component, ChangeDetectionStrategy, inject, signal, effect, computed } from '@angular/core';

import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalServicePaymentProcessorService } from './modal-service-payment-processor.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-service-payment-processor',
  templateUrl: './modal-service-payment-processor.component.html',
  styleUrls: ['./modal-service-payment-processor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalServicePaymentProcessorComponent {

  paymentProcessorService = inject(ModalServicePaymentProcessorService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  paymentProcessors = signal<{ address: string; name: string; serviceLevel: number; state: number }[]>([]);

  // ⚠️ A payment provider attaches PER CURRENCY, not to the service as a whole — the contract's
  // `addPaymentProvider(provider, currencyCode, payRole)` checks the role against the service's
  // ELECTION for that currency (S6/S66). It does NOT go through `partyAttach`, whose payment sets
  // are retired; routing it there asks `_isClearingHouseFor` (the fallthrough branch) about a
  // payment gateway and fails with the misleading "party not authorised for regulator".
  paymentProcessorForm = this.fb.group({
    paymentProcessor: [''],
    currencyCode: [0],
  });

  /** The role is DERIVED from the chosen currency's election — never picked by the operator. */
  selectedCurrency = signal<number>(0);
  currentRoleName = computed(() => {
    const c = this.paymentProcessorService.currencies().find(x => x.currencyCode === this.selectedCurrency());
    return c ? c.payRoleName : '';
  });
  hasCurrencies = computed(() => this.paymentProcessorService.currencies().length > 0);

  constructor() {
    effect(() => {
      if (this.paymentProcessorService.isVisible()) {
        this.loadPaymentProcessors();
        this.paymentProcessorForm.get('paymentProcessor')?.setValue(this.paymentProcessorService.currentPaymentProcessor());
        const first = this.paymentProcessorService.currencies()[0];
        this.paymentProcessorForm.get('currencyCode')?.setValue(first ? first.currencyCode : 0);
        this.selectedCurrency.set(first ? first.currencyCode : 0);
      }
    });
  }

  async loadPaymentProcessors() {
    const [data, curated] = await Promise.all([
      this.apiService.vaultGetPaymentProcessors(1, 50),
      this.apiService.vaultGetServiceProviders(2, 'active'),
    ]);
    if (data?.paymentProcessors) {
      const curatedSet = new Set((curated?.providers ?? []).map((p: any) => p.address.toLowerCase()));
      const excluded = new Set(this.paymentProcessorService.excluded());
      this.paymentProcessors.set(data.paymentProcessors.filter((s: any) =>
        s.state === 2
        && curatedSet.has(s.address.toLowerCase())
        && !excluded.has(s.address.toLowerCase())));
    }
  }

  onCurrencyChange(code: string | number): void {
    this.selectedCurrency.set(Number(code) || 0);
  }

  onSave(): void {
    const provider = this.paymentProcessorForm.get('paymentProcessor')?.value ?? '';
    const currencyCode = Number(this.paymentProcessorForm.get('currencyCode')?.value ?? 0);
    const opt = this.paymentProcessorService.currencies().find(c => c.currencyCode === currencyCode);
    if (!provider || !opt) return;   // the role comes from the election; without it there is nothing valid to send
    this.paymentProcessorService.confirm({ provider, currencyCode, payRole: opt.payRole });
  }

  onCancel(): void {
    this.paymentProcessorService.cancel();
  }
}
