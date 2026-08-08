import { Component, ChangeDetectionStrategy, computed, inject, signal, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalServiceCustodianService, SELF_CUSTODY_SENTINEL } from './modal-service-custodian.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-service-custodian',
  templateUrl: './modal-service-custodian.component.html',
  styleUrls: ['./modal-service-custodian.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalServiceCustodianComponent {

  custodianService = inject(ModalServiceCustodianService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  readonly SELF_CUSTODY = SELF_CUSTODY_SENTINEL;

  custodians = signal<{ address: string; name: string; state: number }[]>([]);
  // Self-custody is offered only while the service is not already its own custodian.
  selfCustodyAvailable = computed(() =>
    !this.custodianService.excluded().includes(this.custodianService.serviceAddress().toLowerCase()));

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
    const [data, curated] = await Promise.all([
      this.apiService.vaultGetEndorsedCustodians(regulator, 1, 50),
      this.apiService.vaultGetServiceProviders(3, 'active'),
    ]);
    if (data?.custodians) {
      const curatedSet = new Set((curated?.providers ?? []).map((p: any) => p.address.toLowerCase()));
      const excluded = new Set(this.custodianService.excluded());
      this.custodians.set(data.custodians.filter((c: any) =>
        (c.state === 2 || c.state === true || c.state === 1)
        && curatedSet.has(c.address.toLowerCase())
        && !excluded.has(c.address.toLowerCase())));
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
