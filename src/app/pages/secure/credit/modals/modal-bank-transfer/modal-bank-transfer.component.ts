import { Component, ChangeDetectionStrategy, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalBankTransferService } from './modal-bank-transfer.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';

@Component({
  selector: 'app-modal-bank-transfer',
  templateUrl: './modal-bank-transfer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalBankTransferComponent {
  modalService = inject(ModalBankTransferService);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private fb = inject(FormBuilder);

  // The entity's own type-2 (service-provider) services — one of which must be a Bank-level PP.
  // The on-chain `bankTransfer` rejects a non-Bank caller, so we don't filter by level here.
  bankServices = signal<{ address: string; name: string }[]>([]);

  form = this.fb.group({
    service:      ['', Validators.required],
    from:         ['', [Validators.required, Validators.pattern(/^0x[a-fA-F0-9]{40}$/)]],
    to:           ['', [Validators.required, Validators.pattern(/^0x[a-fA-F0-9]{40}$/)]],
    currencyCode: [null as number | null, Validators.required],
    amount:       [null as number | null, [Validators.required, Validators.min(0.000001)]],
    trxRefNo:     ['', Validators.required],
    trxDate:      [''],
    note:         [''],
  });

  constructor() {
    effect(() => {
      if (this.modalService.isVisible()) {
        const first = this.modalService.currencies()[0]?.currencyCode ?? null;
        this.form.reset({ service: '', from: '', to: '', currencyCode: first, amount: null, trxRefNo: '', trxDate: '', note: '' });
        void this.loadBankServices();
      }
    });
  }

  private async loadBankServices() {
    const data = await this.apiService.vaultGetServicesOwn(0, 200);
    const list = (data?.services || [])
      .filter((s: any) => Number(s.service_type ?? s.serviceType) === 2)
      .map((s: any) => ({ address: s.address, name: s.name || s.address }));
    this.bankServices.set(list);
  }

  async onSubmit() {
    if (!this.form.valid) return;
    const v = this.form.value;
    if ((v.from || '').toLowerCase() === (v.to || '').toLowerCase()) {
      await this.alertService.show('Error', 'Source and destination subscriptions must differ.');
      return;
    }

    this.loadingService.show('Submitting bank transfer...');
    const providerTrxTime = v.trxDate ? Math.floor(new Date(v.trxDate).getTime() / 1000) : undefined;
    const res = await this.apiService.bankTransfer({
      service:          v.service!,
      from:             v.from!,
      to:               v.to!,
      currencyCode:     Number(v.currencyCode),
      amount:           Number(v.amount),
      providerTrxRefNo: (v.trxRefNo || '').trim(),
      ...(providerTrxTime ? { providerTrxTime } : {}),
      raw:              v.note ? { note: v.note } : {},
    });
    this.loadingService.hide();

    if (res.error) { await this.alertService.show('Error', res.error); return; }
    if (res.requestId) {
      await this.alertService.show('Submitted for approval', 'A second operator must approve before this takes effect.', 'OK');
    } else {
      await this.alertService.show('Success', 'Bank transfer executed.' + (res.result?.transactionHash ? ' Tx: ' + res.result.transactionHash : ''), 'OK');
    }
    this.modalService.confirm();
  }

  onCancel() { this.modalService.cancel(); }
}
