import { Component, ChangeDetectionStrategy, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalTransactionAddService, AddTransactionData } from './modal-transaction-add.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-transaction-add',
  templateUrl: './modal-transaction-add.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalTransactionAddComponent {
  modalService = inject(ModalTransactionAddService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  services = signal<{ address: string; name: string }[]>([]);
  assets = signal<{ address: string; name: string; symbol: string }[]>([]);
  subscriptions = signal<{ address: string; service: string }[]>([]);

  form = this.fb.group({
    trxType: ['Subscribe' as 'Subscribe' | 'Redeem', Validators.required],
    service: ['', Validators.required],
    asset: ['', Validators.required],
    subscription: ['', Validators.required],
    tokens: [null as number | null, [Validators.required, Validators.min(1)]],
  });

  selectedService = signal<string>('');

  filteredAssets = computed(() => {
    const svc = this.selectedService();
    if (!svc) return [];
    return this.assets();
  });

  filteredSubscriptions = computed(() => {
    const svc = this.selectedService();
    if (!svc) return [];
    return this.subscriptions().filter(s => (s.service || '').toLowerCase() === svc.toLowerCase());
  });

  constructor() {
    effect(() => {
      if (this.modalService.isVisible()) {
        this.form.reset({ trxType: 'Subscribe', service: '', asset: '', subscription: '', tokens: null });
        this.selectedService.set('');
        this.assets.set([]);
        this.loadServices();
        this.loadSubscriptions();
      }
    });

    this.form.get('service')!.valueChanges.subscribe(async (value) => {
      const svc = value || '';
      this.selectedService.set(svc);
      this.form.patchValue({ asset: '', subscription: '' }, { emitEvent: false });
      this.assets.set([]);
      if (svc) await this.loadAssetsForService(svc);
    });
  }

  async loadServices() {
    const data = await this.apiService.vaultGetServicesOwn(0, 100);
    if (data?.services) {
      this.services.set(
        data.services
          .filter((s: any) => s.service_type === 1 && (s.state === 2 || s.state === '2'))
          .map((s: any) => ({ address: s.address, name: s.name }))
      );
    }
  }

  async loadAssetsForService(service: string) {
    const data = await this.apiService.vaultGetAssets(0, 200, service);
    if (data?.assets) {
      this.assets.set(
        data.assets.map((a: any) => ({
          address: a.address,
          name: a.name,
          symbol: a.symbol,
        }))
      );
    }
  }

  async loadSubscriptions() {
    const data = await this.apiService.vaultGetSubscriptions(undefined, 0, 1000);
    if (data?.subscriptions) {
      this.subscriptions.set(
        data.subscriptions
          .filter((s: any) => (s.state === 2 || s.state === '2') && !s.suspended)
          .map((s: any) => ({ address: s.address, service: s.service ?? '' }))
      );
    }
  }

  onSave(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const data: AddTransactionData = {
      trxType: v.trxType ?? 'Subscribe',
      service: v.service ?? '',
      asset: v.asset ?? '',
      subscription: v.subscription ?? '',
      tokens: Number(v.tokens),
    };
    this.modalService.confirm(data);
  }

  onCancel(): void {
    this.modalService.cancel();
  }
}
