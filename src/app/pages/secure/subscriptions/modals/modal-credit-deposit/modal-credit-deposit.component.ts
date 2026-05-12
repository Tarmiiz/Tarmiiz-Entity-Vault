import { Component, ChangeDetectionStrategy, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalCreditDepositService } from './modal-credit-deposit.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';

interface ApprovedProcessor {
  service: string;
  name: string;
  regulator: string;
  serviceLevel: number;
}

@Component({
  selector: 'app-modal-credit-deposit',
  templateUrl: './modal-credit-deposit.component.html',
  styleUrls: ['./modal-credit-deposit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalCreditDepositComponent {
  modalService = inject(ModalCreditDepositService);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private fb = inject(FormBuilder);

  processors = signal<ApprovedProcessor[]>([]);

  form = this.fb.group({
    paymentProcessor: ['', Validators.required],
    currencyCode: [null as number | null, Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.000001)]],
    note: [''],
  });

  constructor() {
    effect(() => {
      if (this.modalService.isVisible()) {
        const list = this.modalService.currencies();
        const first = list[0]?.currencyCode ?? null;
        const defaultPp = (this.modalService.paymentProcessor() || '').toLowerCase();
        this.form.reset({ paymentProcessor: defaultPp, currencyCode: first, amount: null, note: '' });
        void this.loadProcessors(defaultPp);
      }
    });
  }

  private async loadProcessors(defaultPp: string) {
    const list = await this.apiService.vaultGetApprovedPaymentProcessors();
    if (!list) {
      this.processors.set([]);
      return;
    }
    this.processors.set(list);
    const match = list.find(p => p.service.toLowerCase() === defaultPp);
    if (match) {
      this.form.patchValue({ paymentProcessor: match.service });
    } else if (list.length > 0) {
      this.form.patchValue({ paymentProcessor: list[0].service });
    }
  }

  async onSubmit() {
    if (!this.form.valid) return;
    const v = this.form.value;
    const service = this.modalService.service();
    if (!service) {
      await this.alertService.show('Error', 'Token-issuer service is missing.');
      return;
    }
    if (!v.paymentProcessor) {
      await this.alertService.show('Error', 'Please select a payment processor.');
      return;
    }

    const body = {
      service,
      paymentProcessor: v.paymentProcessor,
      subscriber: this.modalService.subscriptionAddress(),
      currencyCode: Number(v.currencyCode),
      amount: Number(v.amount),
      data: v.note ? { note: v.note } : {},
    };

    this.loadingService.show('Depositing credit...');
    const res = await this.apiService.creditDeposit(body);
    this.loadingService.hide();

    if (res.error) {
      await this.alertService.show('Error', res.error);
      return;
    }
    this.modalService.confirm(res.result?.transactionHash || '');
  }

  onCancel() {
    this.modalService.cancel();
  }
}
