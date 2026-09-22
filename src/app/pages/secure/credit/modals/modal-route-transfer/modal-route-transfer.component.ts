import { Component, ChangeDetectionStrategy, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ModalRouteTransferService } from './modal-route-transfer.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';

@Component({
  selector: 'app-modal-route-transfer',
  templateUrl: './modal-route-transfer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
})
export class ModalRouteTransferComponent {
  modalService = inject(ModalRouteTransferService);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private fb = inject(FormBuilder);
  private translate = inject(TranslateService);

  // The entity's own type-1 (token-issuer) services — the source service that owns `fromSub`.
  // The on-chain `serviceRouteTransfer` rejects a service that doesn't own the source subscription.
  sourceServices = signal<{ address: string; name: string }[]>([]);

  form = this.fb.group({
    service:            ['', Validators.required],
    fromSub:            ['', [Validators.required, Validators.pattern(/^0x[a-fA-F0-9]{40}$/)]],
    destinationService: ['', [Validators.required, Validators.pattern(/^0x[a-fA-F0-9]{40}$/)]],
    // 33.C 2c — the subscriber's DID hash from onboarding. Credit now takes the identity and the
    // destination account NAMED; the API resolves both from this hash (never an identity address).
    didHash:            ['', [Validators.required, Validators.pattern(/^0x[a-fA-F0-9]{64}$/)]],
    currencyCode:       [null as number | null, Validators.required],
    amount:             [null as number | null, [Validators.required, Validators.min(0.000001)]],
    trxRefNo:           ['', Validators.required],
    trxDate:            [''],
    note:               [''],
  });

  constructor() {
    effect(() => {
      if (this.modalService.isVisible()) {
        const first = this.modalService.currencies()[0]?.currencyCode ?? null;
        this.form.reset({ service: '', fromSub: '', destinationService: '', didHash: '', currencyCode: first, amount: null, trxRefNo: '', trxDate: '', note: '' });
        void this.loadSourceServices();
      }
    });
  }

  private async loadSourceServices() {
    const data = await this.apiService.vaultGetServicesOwn(0, 200);
    const list = (data?.services || [])
      // ⚠️ WAS `service_type === 1` (Phase 28 step (e)). That column is GONE from
      // `services_view`, so the old test would have read `Number(undefined) === 1` —
      // NaN, always false — and emptied this picker SILENTLY. Token-issuer now means
      // holding an ACTIVE Token Issuer license (class 27).
      //
      // 🔴 EMPTY UNTIL THE LICENSE READ ROUTE LANDS (licensing lane): `licenses` is
      // populated by nothing yet, so this picker is empty either way TODAY. The
      // difference is that it now fails for a stated reason rather than by accident.
      .filter((s: any) => ((s.licenses ?? []) as number[]).includes(27))
      .map((s: any) => ({ address: s.address, name: s.name || s.address }));
    this.sourceServices.set(list);
  }

  async onSubmit() {
    if (!this.form.valid) return;
    const v = this.form.value;
    if ((v.service || '').toLowerCase() === (v.destinationService || '').toLowerCase()) {
      await this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('credit.routeTransferModal.mismatchError'));
      return;
    }

    this.loadingService.show(this.translate.instant('credit.routeTransferModal.submitting'));
    const providerTrxTime = v.trxDate ? Math.floor(new Date(v.trxDate).getTime() / 1000) : undefined;
    const res = await this.apiService.routeTransfer({
      service:            v.service!,
      fromSub:            v.fromSub!,
      destinationService: v.destinationService!,
      didHash:            (v.didHash || '').trim(),
      currencyCode:       Number(v.currencyCode),
      amount:             Number(v.amount),
      providerTrxRefNo:   (v.trxRefNo || '').trim(),
      ...(providerTrxTime ? { providerTrxTime } : {}),
      raw:                v.note ? { note: v.note } : {},
    });
    this.loadingService.hide();

    if (res.error) { await this.alertService.info(this.translate.instant('alerts.error'), res.error); return; }
    if (res.requestId) {
      await this.alertService.info(this.translate.instant('approvals.submittedTitle'), this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
    } else {
      await this.alertService.info(
        this.translate.instant('alerts.success'),
        this.translate.instant('credit.routeTransferModal.successMsg') + (res.result?.transactionHash ? ' ' + this.translate.instant('credit.txLabel') + ' ' + res.result.transactionHash : ''),
        this.translate.instant('alerts.ok')
      );
    }
    this.modalService.confirm();
  }

  onCancel() { this.modalService.cancel(); }
}
