import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';

import { ModalServicePaymentProcessorService } from './modal-service-payment-processor.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-service-payment-processor',
  templateUrl: './modal-service-payment-processor.component.html',
  styleUrls: ['./modal-service-payment-processor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
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
    const data = await this.apiService.vaultGetPaymentProcessors(1, 50);
    if (data?.paymentProcessors) {
      this.paymentProcessors.set(data.paymentProcessors.filter((s: any) => s.state === 2));
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
