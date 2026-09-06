import { Component, ChangeDetectionStrategy, inject, effect, signal, computed, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ModalCreditDepositService } from './modal-credit-deposit.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { MoneyPipe } from '../../../../../shared/pipes/money.pipe';

interface ApprovedProcessor {
  service: string;
  name: string;
  regulator: string;
  serviceLevel: number;
}

/** An asset this service distributes that a deposit in the chosen currency can actually buy. */
interface EligibleAsset {
  address: string;
  name: string;
  symbol: string;
  currencyCode: number;
  ask: number;
}

@Component({
  selector: 'app-modal-credit-deposit',
  templateUrl: './modal-credit-deposit.component.html',
  styleUrls: ['./modal-credit-deposit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, MoneyPipe],
})
export class ModalCreditDepositComponent {
  modalService = inject(ModalCreditDepositService);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private fb = inject(FormBuilder);
  private translate = inject(TranslateService);

  processors = signal<ApprovedProcessor[]>([]);
  /**
   * Whether this service may post a ledger row dated other than now (D6 evidence marks).
   *
   * Starts FALSE and stays false unless the chain says otherwise: `CreditProxy.deposit` refuses a
   * timestamp that is neither 0 nor exactly `block.timestamp` without the grant, so offering the
   * field on an ungranted service is offering a guaranteed revert at submit. Note the field is
   * unusable there even for a real-time deposit — chain time lags wall clock and `datetime-local`
   * has a 60 s step, so no browser value can equal `block.timestamp`; empty (⇒ 0 ⇒ block time) is
   * the only input that works.
   */
  backdatingGranted = signal(false);
  /** Every credit-settled asset on this service, before the currency filter. */
  private assets = signal<EligibleAsset[]>([]);
  /** Mirrors the form so the computeds below re-run — a FormControl is not a signal. */
  private assetChoice = signal<string>('');
  private currencyChoice = signal<number | null>(null);
  private amountChoice = signal<number>(0);

  form = this.fb.group({
    provider: ['', Validators.required],
    providerTrxRefNo: ['', Validators.required],
    providerTrxTime: [''],
    currencyCode: [null as number | null, Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.000001)]],
    note: [''],
    // Straight-through (Phase 21). Opt-in per call even when the service allows it.
    buyWithDeposit: [false],
    asset: [''],
  });

  constructor() {
    effect(() => {
      if (this.modalService.isVisible()) {
        // The reset writes signals this effect also reads; untracked() stops that from
        // re-triggering it into a loop that hangs the modal (a standing platform gotcha).
        untracked(() => {
          const list = this.modalService.currencies();
          const first = list[0]?.currencyCode ?? null;
          const defaultPp = (this.modalService.paymentProcessor() || '').toLowerCase();
          this.form.reset({ provider: defaultPp, providerTrxRefNo: '', providerTrxTime: '', currencyCode: first,
                            amount: null, note: '', buyWithDeposit: false, asset: '' });
          this.assets.set([]);
          this.assetChoice.set('');
          this.currencyChoice.set(first);
          this.amountChoice.set(0);
          this.backdatingGranted.set(false);
          void this.loadProcessors(defaultPp);
          void this.loadBackdating();
          if (this.modalService.straightThrough()) void this.loadAssets();
        });
      }
    });

    this.form.controls.asset.valueChanges.subscribe(v => this.assetChoice.set(v ?? ''));
    this.form.controls.currencyCode.valueChanges.subscribe(v => this.currencyChoice.set(v ?? null));
    this.form.controls.amount.valueChanges.subscribe(v => this.amountChoice.set(Number(v) || 0));
  }

  // Only assets settling in the currency being deposited: the combined verb requires the two to
  // match (the API 400s otherwise), and offering a mismatched asset would be a picker whose every
  // choice fails.
  eligibleAssets = computed<EligibleAsset[]>(() => {
    const code = this.currencyChoice();
    return this.assets().filter(a => code == null || Number(a.currencyCode) === Number(code));
  });

  selectedAsset = computed<EligibleAsset | null>(() => {
    const addr = (this.assetChoice() || '').toLowerCase();
    return this.eligibleAssets().find(a => a.address.toLowerCase() === addr) ?? null;
  });

  // Preview only — the API re-resolves the price when the buy actually runs, so this can differ.
  // Floor, matching the server's by-value rule.
  estimatedTokens = computed<number>(() => {
    const a = this.selectedAsset();
    const amount = this.amountChoice();
    if (!a || !(a.ask > 0) || !(amount > 0)) return 0;
    return Math.floor(amount / a.ask);
  });

  residual = computed<number>(() => {
    const a = this.selectedAsset();
    if (!a || !(a.ask > 0)) return 0;
    return Math.max(0, this.amountChoice() - this.estimatedTokens() * a.ask);
  });

  // Disables the transaction-time input rather than hiding it: the field is a real capability the
  // regulator can grant, so an operator who expects it should see WHY it is unavailable instead of
  // finding it missing. The control is disabled through the form (not just `[disabled]` in the
  // template) so a disabled control is also excluded from the submitted value.
  private async loadBackdating() {
    const service = this.modalService.service();
    if (!service) return;
    const { granted } = await this.apiService.vaultGetServiceBackdating(service);
    this.backdatingGranted.set(granted);
    const ctrl = this.form.controls.providerTrxTime;
    if (granted) { ctrl.enable({ emitEvent: false }); }
    else { ctrl.setValue('', { emitEvent: false }); ctrl.disable({ emitEvent: false }); }
  }

  // Restrict the picker to payment processors ATTACHED to this service (1:N). We still pull the
  // approved list for display names/levels, then intersect with the service's attached PP set.
  private async loadProcessors(defaultPp: string) {
    const service = this.modalService.service();
    const [approved, parties] = await Promise.all([
      this.apiService.vaultGetApprovedPaymentProcessors(),
      service ? this.apiService.vaultGetServiceParties(service) : Promise.resolve(null),
    ]);
    const attached = new Set((parties?.paymentProcessors ?? []).map(p => p.address.toLowerCase()));
    const list = (approved ?? []).filter(p => attached.has(p.service.toLowerCase()));
    this.processors.set(list);
    const match = list.find(p => p.service.toLowerCase() === defaultPp);
    if (match) {
      this.form.patchValue({ provider: match.service });
    } else if (list.length > 0) {
      this.form.patchValue({ provider: list[0].service });
    } else {
      this.form.patchValue({ provider: '' });
    }
  }

  // Assets this service distributes. Filtered to credit-settled ones: without credit settlement
  // the mint would not consume the deposited cash, so "deposit and buy" would be two unrelated
  // movements — and the API refuses it for exactly that reason.
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
      // `assets_view` exposes the latest price as `price_ask`. It is a MONEY value and already
      // lands in whole units off the mirror — never formatEther a DB row (platform off-chain
      // storage rule). No price yet ⇒ 0, which suppresses the preview rather than showing a
      // fabricated one.
      ask: Number(a.price_ask ?? 0),
    })));
  }

  async onSubmit() {
    if (!this.form.valid) return;
    const v = this.form.value;
    const service = this.modalService.service();
    if (!service) {
      await this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('subscriptions.creditDepositModal.errorServiceMissing'));
      return;
    }
    if (!v.provider) {
      await this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('subscriptions.creditDepositModal.errorSelectProcessor'));
      return;
    }

    const buying = this.modalService.straightThrough() && v.buyWithDeposit === true;
    if (buying && !v.asset) {
      await this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('subscriptions.creditDepositModal.errorSelectAsset'));
      return;
    }

    const providerRow = this.processors().find(p => p.service.toLowerCase() === String(v.provider).toLowerCase());
    const body = {
      service,
      provider: v.provider,
      ...(providerRow?.name ? { providerName: providerRow.name } : {}),
      providerTrxRefNo: (v.providerTrxRefNo || '').trim(),
      ...(v.providerTrxTime
        ? { providerTrxTime: Math.floor(new Date(v.providerTrxTime as string).getTime() / 1000) }
        : {}),
      subscriber: this.modalService.subscriptionAddress(),
      currencyCode: Number(v.currencyCode),
      amount: Number(v.amount),
      raw: v.note ? { note: v.note } : {},
    };

    // The two branches are kept apart rather than folded into one ternary: a union of their
    // response shapes loses `buyError`, which is the one thing this handler must not drop.
    //
    // ⚠️ CORRECTED 2026-09-06: this used to say "only the combined verb carries `buyError`".
    // That is no longer true. On a STRAIGHT-THROUGH service the plain `/credit/deposit` now
    // PERFORMS a deposit-buy, so the `!buying` branch can carry `buyError` too — the deposit
    // mined and the purchase did not. This code was already correct, because it forwards the
    // field unconditionally; only the reasoning was stale, and a reader who trusted it would
    // have concluded the plain branch could safely ignore it.
    this.loadingService.show(this.translate.instant(
      buying ? 'subscriptions.creditDepositModal.depositingAndBuying' : 'subscriptions.creditDepositModal.depositing'));

    if (!buying) {
      const res = await this.apiService.creditDeposit(body);
      this.loadingService.hide();
      if (res.error) {
        await this.alertService.info(this.translate.instant('alerts.error'), res.error);
        return;
      }
      this.modalService.confirm({ txHash: res.result?.transactionHash || '' });
      return;
    }

    const res = await this.apiService.creditDepositBuy({ ...body, asset: String(v.asset) });
    this.loadingService.hide();
    if (res.error) {
      await this.alertService.info(this.translate.instant('alerts.error'), res.error);
      return;
    }

    // Combined verb: a 200 can still mean the deposit landed and the buy did not. Hand both
    // halves back so the page reports what actually happened — treating this as a plain success
    // would tell the operator units were bought when only cash moved.
    const deposit = res.result?.deposit;
    const buy = res.result?.buy;
    this.modalService.confirm({
      txHash: deposit?.transactionHash || '',
      bought: buy ? { asset: String(v.asset), tokens: buy.tokens, price: buy.price, txHash: buy.transactionHash } : null,
      buyError: res.buyError,
    });
  }

  onCancel() {
    this.modalService.cancel();
  }
}
