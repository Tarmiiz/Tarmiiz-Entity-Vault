import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalSpAddService } from './modal-sp-add.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { PARTY_CLASS } from '../../../../../shared/constants/party-class';

interface PickerItem { address: string; name: string; level: number; }

@Component({
  selector: 'app-modal-sp-add',
  templateUrl: './modal-sp-add.component.html',
  styleUrls: ['./modal-sp-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalSpAddComponent {

  spAddService = inject(ModalSpAddService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  options = signal<PickerItem[]>([]);
  loadingOptions = signal(false);

  /** Exposed for the template's `[ngValue]` bindings — a template cannot read a module import. */
  readonly PC = PARTY_CLASS;

  spForm = this.fb.group({
    spType:   [1],
    provider: [''],
  });

  constructor() {
    // Reset + load the regulator's authorised list for the default type when the modal opens.
    effect(() => {
      if (this.spAddService.isVisible()) {
        this.spForm.reset({ spType: PARTY_CLASS.VALIDATOR, provider: '' });
        this.loadOptions(PARTY_CLASS.VALIDATOR);
      }
    });
  }

  onTypeChange(): void {
    const spType = Number(this.spForm.get('spType')?.value ?? 1);
    this.spForm.get('provider')?.setValue('');
    this.loadOptions(spType);
  }

  async loadOptions(spType: number): Promise<void> {
    this.loadingOptions.set(true);
    this.options.set([]);
    try {
      let items: any[] = [];
      // ⚠️ Keyed by PARTY_CLASS, never by literal. These branches read `3 -> Custodian` and
      // `4 -> Clearing House`, the pre-split numbering: 3 is now BANK and 4 is Custodian. The
      // form therefore offered a "Custodian" option that submitted class 3, and the chain
      // correctly answered that the chosen service is not a Bank — surfacing as a bare revert.
      if (spType === PARTY_CLASS.VALIDATOR) {
        const d = await this.apiService.vaultGetValidators(1, 50);
        items = (d?.validators ?? []).filter((v: any) => v.state === 2)
          .map((v: any) => ({ address: v.address, name: v.name, level: v.validationLevel }));
      } else if (spType === PARTY_CLASS.PAYMENT_GATEWAY || spType === PARTY_CLASS.BANK) {
        // ⚠️ The endpoint returns the RAIL UNION (classes 2 + 3), so it MUST be narrowed to the
        // selected class here. It previously was not, on the reasoning that "which of the two a
        // candidate is registered as is decided by its on-chain party record, not by this
        // dropdown" — that is false. `spType` IS submitted, and `EntityTemplate.addServiceProvider`
        // checks `isPartyFor(regulator, provider, spType)`, so choosing Payment Gateway and then
        // picking a Bank reverts with "Entity: provider not authorised by regulator". The picker
        // was offering options guaranteed to fail.
        const d = await this.apiService.vaultGetPaymentProcessors(1, 50);
        items = (d?.paymentProcessors ?? [])
          .filter((s: any) => s.state === 2 && Number(s.classId) === spType)
          .map((s: any) => ({ address: s.address, name: s.name, level: s.serviceLevel ?? s.level }));
      } else if (spType === PARTY_CLASS.CLEARING_HOUSE || spType === PARTY_CLASS.ESCROW_CH) {
        // Same union + same narrowing as the rail classes above: this endpoint returns BOTH
        // clearing classes (5 entities' CH + 6 venue escrow CH), and they are separate
        // appointments — an escrow CH offered under "Clearing House" reverts on submit.
        const d = await this.apiService.vaultGetClearingHouses(1, 50);
        items = (d?.clearingHouses ?? [])
          .filter((c: any) => c.state === 2 && Number(c.classId) === spType)
          .map((c: any) => ({ address: c.address, name: c.name, level: c.level }));
      } else if (spType === PARTY_CLASS.DEPOSITARY) {
        // Phase 4.9's fund-level appointment — its own endpoint (no union), but the class is still
        // asserted on every row so a mis-served list cannot offer a revert. (The fund administrator
        // left this picker with §H: it takes a seat on the ASSET.)
        const d = (await this.apiService.vaultGetDepositaries(1, 50))?.depositaries;
        items = (d ?? [])
          .filter((c: any) => c.state === 2 && Number(c.classId) === spType)
          .map((c: any) => ({ address: c.address, name: c.name, level: c.level }));
      }
      const existing = this.spAddService.existing();
      this.options.set(items.filter(i => !existing.includes(i.address.toLowerCase())));
    } finally {
      this.loadingOptions.set(false);
    }
  }

  onSave(): void {
    const spType = Number(this.spForm.get('spType')?.value ?? 1);
    const provider = this.spForm.get('provider')?.value ?? '';
    if (!provider) return;
    this.spAddService.confirm({ provider, spType });
  }

  onCancel(): void {
    this.spAddService.cancel();
  }
}
