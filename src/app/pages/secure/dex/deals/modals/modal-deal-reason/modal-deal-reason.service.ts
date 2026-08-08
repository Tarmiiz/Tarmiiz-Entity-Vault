import { Injectable, signal } from '@angular/core';

export type DealReasonKind = 'decline' | 'withdraw' | 'venue-reject';

/**
 * The three terminal actions that carry a written reason.
 *
 * `venue-reject` REQUIRES one: it is a pre-trade rejection by the venue operator of
 * a deal both counterparties already agreed, and that has a regulatory expectation
 * of a stated reason (which is why the on-chain DealStatusChanged event carries a
 * `reason` field at all, unlike its OfferingStatusChanged ancestor). Declining or
 * withdrawing your own quote does not — a trader owes no one an explanation for
 * walking away from their own price.
 *
 * Accept and venue-approve are NOT here: an approval needs no justification, and
 * adding a reason box to them would imply otherwise.
 */
@Injectable({ providedIn: 'root' })
export class ModalDealReasonService {
  isVisible = signal(false);
  kind = signal<DealReasonKind>('decline');
  dealLabel = signal('');

  private resolveFn?: (value: { reason: string } | null) => void;

  show(kind: DealReasonKind, dealLabel = ''): Promise<{ reason: string } | null> {
    this.kind.set(kind);
    this.dealLabel.set(dealLabel);
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(reason: string): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn({ reason });
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
