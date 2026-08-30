import { Injectable, signal } from '@angular/core';

import { DexDealCounterparty } from '../../../../../../shared/models/data.model';

export interface DealTermsResult {
  /** Propose only. */
  dexService?: string;
  counterparty?: string;
  baseAsset?: string;
  side?: number;
  funding?: number;
  expiresAt?: number;
  /** Both modes. */
  subscription: string;
  price: number;
  amount: number;
}

export interface DealTermsContext {
  mode: 'propose' | 'counter';
  /** Our subscriptions that may act. Counter mode pre-selects the one that owns our side. */
  subscriptions: { address: string; label: string }[];
  /** Propose mode only. */
  venues?: { address: string; label: string }[];
  assets?: { address: string; label: string }[];
  counterparties?: DexDealCounterparty[];
  /** Counter mode only — the terms currently on the table, to show as the baseline. */
  currentPrice?: number;
  currentAmount?: number;
  currentSide?: number;      // the PROPOSER's side; ours is the inverse when we are the counterparty
  currentFunding?: number;
  weAreProposer?: boolean;
  assetLabel?: string;
  currencyLabel?: string;
}

/**
 * One modal for both terms-setting actions, because they set the SAME two fields.
 *
 * A counter is not a different kind of object from a proposal — it moves price and
 * amount and nothing else (side, funding and the expiry clock are all fixed at
 * propose and immutable afterwards). Two components would have duplicated the
 * numeric inputs and their validation, and drifted.
 */
@Injectable({ providedIn: 'root' })
export class ModalDealTermsService {
  isVisible = signal(false);
  ctx = signal<DealTermsContext>({ mode: 'propose', subscriptions: [] });

  private resolveFn?: (value: DealTermsResult | null) => void;

  show(ctx: DealTermsContext): Promise<DealTermsResult | null> {
    this.ctx.set(ctx);
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(value: DealTermsResult): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(value);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
