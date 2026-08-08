import { Injectable, signal } from '@angular/core';

import { DexDealCounterparty } from '../../../../../../shared/models/data.model';

export interface RfqCreateResult {
  subscription: string;
  dexService: string;
  baseAsset: string;
  side: number;
  funding: number;
  marketScope: number;
  amount: number;
  expiresAt: number;
  openToAll: boolean;
  invited: string[];
}

export interface RfqCreateContext {
  /** Our subscriptions that may make the request. */
  subscriptions: { address: string; label: string }[];
  venues: { address: string; label: string }[];
  assets: { address: string; label: string }[];
  /** Dealers we have dealt with before — the invite picker's starting point. */
  counterparties: DexDealCounterparty[];
}

/**
 * The request form.
 *
 * Note what is NOT on it: a PRICE. Fixing the size and asking only for price is what
 * makes the answers comparable and the award well-defined — a request that also
 * named a price would be a proposal, and that is the deals surface.
 */
@Injectable({ providedIn: 'root' })
export class ModalRfqCreateService {
  isVisible = signal(false);
  ctx = signal<RfqCreateContext>({ subscriptions: [], venues: [], assets: [], counterparties: [] });

  private resolveFn?: (value: RfqCreateResult | null) => void;

  show(ctx: RfqCreateContext): Promise<RfqCreateResult | null> {
    this.ctx.set(ctx);
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(value: RfqCreateResult): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(value);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
