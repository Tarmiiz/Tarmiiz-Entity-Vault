import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder } from '@angular/forms';

import { ModalServiceCustodianService, SELF_CUSTODY_SENTINEL } from './modal-service-custodian.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-service-custodian',
  templateUrl: './modal-service-custodian.component.html',
  styleUrls: ['./modal-service-custodian.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
})
export class ModalServiceCustodianComponent {

  custodianService = inject(ModalServiceCustodianService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  readonly SELF_CUSTODY = SELF_CUSTODY_SENTINEL;

  custodians = signal<{ address: string; name: string; state: number }[]>([]);

  custodianForm = this.fb.group({
    custodian: [''],
  });

  constructor() {
    effect(() => {
      if (this.custodianService.isVisible()) {
        this.loadCustodians();
        this.custodianForm.get('custodian')?.setValue(this.custodianService.currentCustodian());
      }
    });
  }

  async loadCustodians() {
    const regulator = this.custodianService.regulatorAddress();
    if (!regulator) {
      this.custodians.set([]);
      return;
    }
    const data = await this.apiService.vaultGetEndorsedCustodians(regulator, 1, 50);
    if (data?.custodians) {
      this.custodians.set(data.custodians.filter((c: any) => c.state === 2 || c.state === true || c.state === 1));
    } else {
      this.custodians.set([]);
    }
  }

  onSave(): void {
    const value = this.custodianForm.get('custodian')?.value ?? '';
    this.custodianService.confirm(value);
  }

  onCancel(): void {
    this.custodianService.cancel();
  }
}
