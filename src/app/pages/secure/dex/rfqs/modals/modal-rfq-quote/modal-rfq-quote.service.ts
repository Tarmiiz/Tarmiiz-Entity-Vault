import { Injectable, signal } from '@angular/core';

export interface RfqQuoteResult {
  subscription: string;
  price: number;
}

export interface RfqQuoteContext {
  /** Our subscriptions that may answer. */
  subscriptions: { address: string; label: string }[];
  /** Everything the request FIXES, shown read-only so the dealer quotes into context. */
  assetLabel: string;
  currencyLabel: string;
  amount: number;
  /** OUR side as the dealer — the inverse of the requester's. */
  dealerSideLabel: string;
  funding: number;
  expiresAt: number;
}

/**
 * The dealer's answer.
 *
 * One field, deliberately: size, expiry, market scope and funding are the requester's
 * terms and the contract overwrites anything else sent. Offering those as inputs would
 * imply a negotiation that does not exist at this step — countering comes later, once
 * the quote IS a deal.
 */
@Injectable({ providedIn: 'root' })
export class ModalRfqQuoteService {
  isVisible = signal(false);
  ctx = signal<RfqQuoteContext>({
    subscriptions: [], assetLabel: '', currencyLabel: '', amount: 0,
    dealerSideLabel: '', funding: 1, expiresAt: 0,
  });

  private resolveFn?: (value: RfqQuoteResult | null) => void;

  show(ctx: RfqQuoteContext): Promise<RfqQuoteResult | null> {
    this.ctx.set(ctx);
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(value: RfqQuoteResult): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(value);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
