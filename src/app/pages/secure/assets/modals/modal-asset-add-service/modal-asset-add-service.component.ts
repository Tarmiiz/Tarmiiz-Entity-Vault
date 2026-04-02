import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalAssetAddServiceService } from './modal-asset-add-service.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-asset-add-service',
  templateUrl: './modal-asset-add-service.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalAssetAddServiceComponent {

  addServiceModal = inject(ModalAssetAddServiceService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  lookedUpService = signal<{ address: string; name: string; state: number; stateName: string } | null>(null);
  lookupError = signal<string | null>(null);
  isLooking = signal(false);

  addressForm = this.fb.group({
    address: ['', Validators.required],
  });

  constructor() {
    effect(() => {
      if (!this.addServiceModal.isVisible()) {
        this.addressForm.reset();
        this.lookedUpService.set(null);
        this.lookupError.set(null);
      }
    });
  }

  async onLookup() {
    const address = this.addressForm.get('address')?.value?.trim();
    if (!address) return;

    const current = this.addServiceModal.currentServices();
    if (current.includes(address)) {
      this.lookupError.set('This service is already associated with the asset.');
      this.lookedUpService.set(null);
      return;
    }

    this.isLooking.set(true);
    this.lookedUpService.set(null);
    this.lookupError.set(null);

    const data = await this.apiService.vaultGetService(address);
    this.isLooking.set(false);

    if (data) {
      this.lookedUpService.set({
        address: data.address,
        name: data.name ?? data.address,
        state: data.state,
        stateName: data.state_name ?? String(data.state),
      });
    } else {
      this.lookupError.set('Service not found. Please check the address and try again.');
    }
  }

  onConfirm(): void {
    const svc = this.lookedUpService();
    if (svc) {
      this.addServiceModal.confirm(svc.address);
    }
  }

  onCancel(): void {
    this.addServiceModal.cancel();
  }
}
