import { Component, ChangeDetectionStrategy, computed, effect, inject, signal, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalDealTermsService } from './modal-deal-terms.service';

/** Sensible default: long enough for a human round trip, short enough not to pin capital. */
const DEFAULT_TTL_HOURS = 24;
const MIN_TTL_MINUTES = 15;      // contract floor — a deal must not be born unapprovable
const MAX_TTL_DAYS = 30;         // contract ceiling

@Component({
  selector: 'app-modal-deal-terms',
  templateUrl: './modal-deal-terms.component.html',
  styleUrls: ['./modal-deal-terms.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, DecimalPipe],
})
export class ModalDealTermsComponent {
  modalService = inject(ModalDealTermsService);

  subscription = signal('');
  dexService   = signal('');
  counterparty = signal('');
  baseAsset    = signal('');
  side         = signal(1);
  funding      = signal(1);
  ttlHours     = signal(DEFAULT_TTL_HOURS);
  price        = signal<number | null>(null);
  amount       = signal<number | null>(null);
  error        = signal('');

  isPropose = computed(() => this.modalService.ctx().mode === 'propose');

  /**
   * Reset on open. Wrapped in untracked() because writing signals this effect also
   * READS would re-trigger it forever and hang the UI — the standing platform trap
   * with modal open-effects.
   */
  private readonly resetOnOpen = effect(() => {
    if (!this.modalService.isVisible()) return;
    untracked(() => {
      const c = this.modalService.ctx();
      this.error.set('');
      this.subscription.set(c.subscriptions[0]?.address ?? '');
      if (c.mode === 'propose') {
        this.dexService.set(c.venues?.[0]?.address ?? '');
        this.counterparty.set('');
        this.baseAsset.set(c.assets?.[0]?.address ?? '');
        this.side.set(1);
        this.funding.set(1);
        this.ttlHours.set(DEFAULT_TTL_HOURS);
        this.price.set(null);
        this.amount.set(null);
      } else {
        // Seed with what is on the table so a counter that only moves price does not
        // make the user retype the size — and so the delta is visible as they edit.
        this.price.set(c.currentPrice ?? null);
        this.amount.set(c.currentAmount ?? null);
      }
    });
  });

  /** OUR side: on a counter we are whichever party the proposer is not. */
  ourSideLabel = computed(() => {
    const c = this.modalService.ctx();
    if (c.mode === 'propose') return this.side() === 1 ? 'dex.deals.side.buy' : 'dex.deals.side.sell';
    const proposerBuys = c.currentSide === 1;
    const weBuy = c.weAreProposer ? proposerBuys : !proposerBuys;
    return weBuy ? 'dex.deals.side.buy' : 'dex.deals.side.sell';
  });

  notional = computed(() => {
    const p = Number(this.price() ?? 0);
    const a = Number(this.amount() ?? 0);
    return p > 0 && a > 0 ? p * a : 0;
  });

  /** Only meaningful on a counter — how far this moves the live quote. */
  priceDelta = computed(() => {
    const c = this.modalService.ctx();
    if (c.mode !== 'counter' || !c.currentPrice) return null;
    const p = Number(this.price() ?? 0);
    if (!(p > 0)) return null;
    return ((p - c.currentPrice) / c.currentPrice) * 100;
  });

  onSubmit(): void {
    const c = this.modalService.ctx();
    this.error.set('');

    const price = Number(this.price() ?? 0);
    const amount = Number(this.amount() ?? 0);
    if (!(price > 0))  { this.error.set('dex.deals.termsModal.errPrice');  return; }
    if (!(amount > 0)) { this.error.set('dex.deals.termsModal.errAmount'); return; }
    if (!this.subscription()) { this.error.set('dex.deals.termsModal.errSubscription'); return; }

    if (c.mode === 'counter') {
      this.modalService.confirm({ subscription: this.subscription(), price, amount });
      return;
    }

    if (!this.dexService())   { this.error.set('dex.deals.termsModal.errVenue');        return; }
    if (!this.baseAsset())    { this.error.set('dex.deals.termsModal.errAsset');        return; }
    if (!this.counterparty()) { this.error.set('dex.deals.termsModal.errCounterparty'); return; }
    if (this.counterparty().toLowerCase() === this.subscription().toLowerCase()) {
      this.error.set('dex.deals.termsModal.errSelfDeal'); return;
    }

    const hours = Number(this.ttlHours() || 0);
    if (hours * 60 < MIN_TTL_MINUTES) { this.error.set('dex.deals.termsModal.errTtlMin'); return; }
    if (hours > MAX_TTL_DAYS * 24)    { this.error.set('dex.deals.termsModal.errTtlMax'); return; }

    this.modalService.confirm({
      subscription: this.subscription(),
      dexService:   this.dexService(),
      counterparty: this.counterparty(),
      baseAsset:    this.baseAsset(),
      side:         Number(this.side()),
      funding:      Number(this.funding()),
      // Unix SECONDS — the contract's clock. The mirror's expires_at is milliseconds;
      // do not confuse the two.
      expiresAt:    Math.floor(Date.now() / 1000) + Math.round(hours * 3600),
      price,
      amount,
    });
  }

  onCancel(): void { this.modalService.cancel(); }
}
