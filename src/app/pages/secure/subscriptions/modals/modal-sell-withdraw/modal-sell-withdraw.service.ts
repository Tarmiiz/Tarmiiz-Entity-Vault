import { Injectable, signal } from '@angular/core';

import { CreditBalance } from '../../../../../shared/models/data.model';

/**
 * The outcome of a straight-through sell+withdraw.
 *
 * ⚠️ `requestId` is a REQUEST, not a payout. The money moves later, at the fulfil leg
 * (`POST /credit/withdrawals/:requestId/fulfil`), which is unchanged by this feature. Any copy
 * rendered from this must not say the subscriber has been paid.
 */
export interface SellWithdrawResult {
  sellTxHash: string;
  tokens: string;
  requestId: string | null;
  withdrawTxHash: string | null;
  /** Set when the redeem mined but the withdrawal request did not open. Proceeds sit on the claim. */
  withdrawError?: string;
}

@Injectable({ providedIn: 'root' })
export class ModalSellWithdrawService {
  isVisible = signal(false);
  subscriptionAddress = signal<string>('');
  service = signal<string>('');
  currencies = signal<CreditBalance[]>([]);

  private resolveFn?: (value: SellWithdrawResult | null) => void;

  show(input: { subscriptionAddress: string; service: string; currencies: CreditBalance[] }): Promise<SellWithdrawResult | null> {
    this.subscriptionAddress.set(input.subscriptionAddress);
    this.service.set(input.service);
    this.currencies.set(input.currencies);
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(result: SellWithdrawResult): void {
    this.isVisible.set(false);
    this.resolveFn?.(result);
  }

  cancel(): void {
    this.isVisible.set(false);
    this.resolveFn?.(null);
  }
}
