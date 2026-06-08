import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder } from '@angular/forms';

import { ModalServicePaymentProcessorService } from './modal-service-payment-processor.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-service-payment-processor',
  templateUrl: './modal-service-payment-processor.component.html',
  styleUrls: ['./modal-service-payment-processor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
})
export class ModalServicePaymentProcessorComponent {

  paymentProcessorService = inject(ModalServicePaymentProcessorService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  paymentProcessors = signal<{ address: string; name: string; serviceLevel: number; state: number }[]>([]);

  paymentProcessorForm = this.fb.group({
    paymentProcessor: [''],
  });

  constructor() {
    effect(() => {
      if (this.paymentProcessorService.isVisible()) {
        this.loadPaymentProcessors();
        this.paymentProcessorForm.get('paymentProcessor')?.setValue(this.paymentProcessorService.currentPaymentProcessor());
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
      this.paymentProcessors.set(data.paymentProcessors.filter((s: any) => s.state === 2 && curatedSet.has(s.address.toLowerCase())));
    }
  }

  onSave(): void {
    const value = this.paymentProcessorForm.get('paymentProcessor')?.value ?? '';
    this.paymentProcessorService.confirm(value);
  }

  onCancel(): void {
    this.paymentProcessorService.cancel();
  }
}
