import { Injectable, signal } from '@angular/core';

import { CreditBalance } from '../../../../../shared/models/data.model';

/** What the deposit produced. `bought` is present only on a straight-through deposit+buy. */
export interface CreditDepositResult {
  txHash: string;
  /** Set when the caller chose "Buy with deposit" AND the buy leg succeeded. */
  bought?: { asset: string; tokens: string; price: string; txHash: string } | null;
  /**
   * Set when the deposit mined but the BUY leg did not. The cash is safely on the claim —
   * the caller must surface this rather than reporting a plain success.
   */
  buyError?: string;
}

@Injectable({ providedIn: 'root' })
export class ModalCreditDepositService {
  isVisible = signal(false);
  subscriptionAddress = signal<string>('');
  service = signal<string>('');
  paymentProcessor = signal<string>('');
  currencies = signal<CreditBalance[]>([]);
  /**
   * Whether the SERVICE has declared straight-through transactions (Phase 21). Drives the
   * optional "Buy with deposit" section — the section is not rendered at all when off, because
   * the API would 409 the combined verb.
   */
  straightThrough = signal(false);

  private resolveFn?: (value: CreditDepositResult | null) => void;

  show(input: { subscriptionAddress: string; service: string; paymentProcessor: string; currencies: CreditBalance[]; straightThrough?: boolean }): Promise<CreditDepositResult | null> {
    this.subscriptionAddress.set(input.subscriptionAddress);
    this.service.set(input.service);
    this.paymentProcessor.set(input.paymentProcessor);
    this.currencies.set(input.currencies);
    this.straightThrough.set(input.straightThrough === true);
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(result: CreditDepositResult): void {
    this.isVisible.set(false);
    this.resolveFn?.(result);
  }

  cancel(): void {
    this.isVisible.set(false);
    this.resolveFn?.(null);
  }
}
