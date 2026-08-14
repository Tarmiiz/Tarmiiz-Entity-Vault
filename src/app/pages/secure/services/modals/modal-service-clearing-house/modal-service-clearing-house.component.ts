import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalServiceClearingHouseService } from './modal-service-clearing-house.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-service-clearing-house',
  templateUrl: './modal-service-clearing-house.component.html',
  styleUrls: ['./modal-service-clearing-house.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalServiceClearingHouseComponent {

  clearingHouseService = inject(ModalServiceClearingHouseService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  clearingHouses = signal<{ address: string; name: string; level: number; state: number }[]>([]);

  clearingHouseForm = this.fb.group({
    clearingHouse: [''],
  });

  constructor() {
    effect(() => {
      if (this.clearingHouseService.isVisible()) {
        this.loadClearingHouses();
        this.clearingHouseForm.get('clearingHouse')?.setValue(this.clearingHouseService.currentClearingHouse());
      }
    });
  }

  async loadClearingHouses() {
    // The regulator's authorised CCPs intersected with the entity's own curated set —
    // `ServiceTemplate.addClearingHouse` requires BOTH (isClearingHouseFor + the curated
    // membership check), so offering one that fails either would only produce a revert.
    // spType 4 here and role 4 at attach — one numbering, no translation.
    const [data, curated] = await Promise.all([
      this.apiService.vaultGetClearingHouses(1, 50),
      this.apiService.vaultGetServiceProviders(4, 'active'),
    ]);
    if (data?.clearingHouses) {
      const curatedSet = new Set((curated?.providers ?? []).map((p: any) => p.address.toLowerCase()));
      const excluded = new Set(this.clearingHouseService.excluded());
      this.clearingHouses.set(data.clearingHouses.filter((c: any) =>
        c.state === 2
        && curatedSet.has(c.address.toLowerCase())
        && !excluded.has(c.address.toLowerCase())));
    }
  }

  onSave(): void {
    const value = this.clearingHouseForm.get('clearingHouse')?.value ?? '';
    this.clearingHouseService.confirm(value);
  }

  onCancel(): void {
    this.clearingHouseService.cancel();
  }
}
