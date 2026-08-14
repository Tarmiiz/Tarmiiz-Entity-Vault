import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalSpAddService } from './modal-sp-add.service';
import { ApiService } from '../../../../../shared/services/api.service';

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

  spForm = this.fb.group({
    spType:   [1],
    provider: [''],
  });

  constructor() {
    // Reset + load the regulator's authorised list for the default type when the modal opens.
    effect(() => {
      if (this.spAddService.isVisible()) {
        this.spForm.reset({ spType: 1, provider: '' });
        this.loadOptions(1);
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
      if (spType === 1) {
        const d = await this.apiService.vaultGetValidators(1, 50);
        items = (d?.validators ?? []).filter((v: any) => v.state === 2)
          .map((v: any) => ({ address: v.address, name: v.name, level: v.validationLevel }));
      } else if (spType === 2) {
        const d = await this.apiService.vaultGetPaymentProcessors(1, 50);
        items = (d?.paymentProcessors ?? []).filter((s: any) => s.state === 2)
          .map((s: any) => ({ address: s.address, name: s.name, level: s.serviceLevel ?? s.level }));
      } else if (spType === 3) {
        const d = await this.apiService.vaultGetEndorsedCustodians('', 1, 50);
        items = (d?.custodians ?? []).filter((c: any) => c.state === 2 || c.state === 1 || c.state === true)
          .map((c: any) => ({ address: c.address, name: c.name, level: c.level }));
      } else if (spType === 4) {
        // Clearing House — Regulator Party Type 4, the last of the contiguous attachable band.
        const d = await this.apiService.vaultGetClearingHouses(1, 50);
        items = (d?.clearingHouses ?? []).filter((c: any) => c.state === 2)
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
