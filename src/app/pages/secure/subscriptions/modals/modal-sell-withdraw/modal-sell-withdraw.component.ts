import { Component, ChangeDetectionStrategy, inject, effect, signal, computed, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ModalSellWithdrawService } from './modal-sell-withdraw.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { MoneyPipe } from '../../../../../shared/pipes/money.pipe';

interface SellableAsset {
  address: string;
  name: string;
  symbol: string;
  currencyCode: number;
  bid: number;
}

/**
 * Straight-through cash-out: redeem units, then OPEN a withdrawal request.
 *
 * ⚠️ This modal does NOT pay anyone. S79/S80 keep the fiat leg asynchronous — the request joins
 * the service's per-currency queue and the money moves at the separate fulfil leg. The copy is
 * written to say "requested", never "withdrawn", because reporting a payout at the moment a
 * claim was merely held is the exact failure the request/fulfil split exists to prevent.
 */
@Component({
  selector: 'app-modal-sell-withdraw',
  templateUrl: './modal-sell-withdraw.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, MoneyPipe],
})
export class ModalSellWithdrawComponent {
  modalService = inject(ModalSellWithdrawService);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private fb = inject(FormBuilder);
  private translate = inject(TranslateService);

  private assets = signal<SellableAsset[]>([]);
  private assetChoice = signal<string>('');
  private tokensChoice = signal<number>(0);

  form = this.fb.group({
    asset: ['', Validators.required],
    tokens: [null as number | null, [Validators.required, Validators.min(1)]],
    // The payout destination, as its bytes32 hash. Required — the contract refuses a request
    // without one, because a withdrawal with no destination is not an instruction.
    instrument: ['', Validators.required],
    minterOfRecord: [''],
    providerTrxRefNo: ['', Validators.required],
  });

  constructor() {
    effect(() => {
      if (this.modalService.isVisible()) {
        // untracked(): the reset writes signals this effect reads, which would otherwise loop.
        untracked(() => {
          this.form.reset({ asset: '', tokens: null, instrument: '', minterOfRecord: '', providerTrxRefNo: '' });
          this.assets.set([]);
          this.assetChoice.set('');
          this.tokensChoice.set(0);
          void this.loadAssets();
        });
      }
    });

    this.form.controls.asset.valueChanges.subscribe(v => this.assetChoice.set(v ?? ''));
    this.form.controls.tokens.valueChanges.subscribe(v => this.tokensChoice.set(Number(v) || 0));
  }

  sellableAssets = computed<SellableAsset[]>(() => this.assets());

  selectedAsset = computed<SellableAsset | null>(() => {
    const addr = (this.assetChoice() || '').toLowerCase();
    return this.assets().find(a => a.address.toLowerCase() === addr) ?? null;
  });

  // Estimate only. The API derives the real figure from the redeem's DECODED on-chain outcome
  // and caps it at the free claim, so a service fee or a moved bid changes what is actually
  // requested. Labelled as an estimate for that reason.
  estimatedProceeds = computed<number>(() => {
    const a = this.selectedAsset();
    const tokens = this.tokensChoice();
    if (!a || !(a.bid > 0) || !(tokens > 0)) return 0;
    return tokens * a.bid;
  });

  private async loadAssets() {
    const service = this.modalService.service();
    if (!service) return;
    const data = await this.apiService.vaultGetAssets(0, 200, service);
    const rows = (data?.assets ?? []).filter((a: any) => a.credit_settlement === 1 || a.credit_settlement === true);
    this.assets.set(rows.map((a: any) => ({
      address: a.address,
      name: a.name ?? '',
      symbol: a.symbol ?? '',
      currencyCode: Number(a.currency_code ?? 0),
      // MONEY off the mirror is already in whole units — never formatEther a DB row.
      bid: Number(a.price_bid ?? 0),
    })));
  }

  async onSubmit() {
    if (!this.form.valid) return;
    const v = this.form.value;
    const service = this.modalService.service();
    if (!service) {
      await this.alertService.show(this.translate.instant('alerts.error'), this.translate.instant('subscriptions.sellWithdrawModal.errorServiceMissing'));
      return;
    }

    this.loadingService.show(this.translate.instant('subscriptions.sellWithdrawModal.submitting'));
    const res = await this.apiService.creditSellWithdraw({
      service,
      subscriber: this.modalService.subscriptionAddress(),
      asset: String(v.asset),
      tokens: Number(v.tokens),
      instrument: (v.instrument || '').trim(),
      ...(v.minterOfRecord ? { minterOfRecord: (v.minterOfRecord as string).trim() } : {}),
      providerTrxRefNo: (v.providerTrxRefNo || '').trim(),
    });
    this.loadingService.hide();

    if (res.error) {
      await this.alertService.show(this.translate.instant('alerts.error'), res.error);
      return;
    }

    // A 200 can still mean the redeem landed and the request did not open. Hand both halves
    // back rather than collapsing them — the proceeds are on the claim either way, and the
    // operator needs to know whether a request exists to fulfil.
    const sell = res.result?.sell;
    const wd = res.result?.withdrawal;
    this.modalService.confirm({
      sellTxHash: sell?.transactionHash || '',
      tokens: sell?.tokens ?? String(v.tokens),
      requestId: wd?.requestId ?? null,
      withdrawTxHash: wd?.transactionHash ?? null,
      withdrawError: res.withdrawError,
    });
  }

  onCancel() {
    this.modalService.cancel();
  }
}
