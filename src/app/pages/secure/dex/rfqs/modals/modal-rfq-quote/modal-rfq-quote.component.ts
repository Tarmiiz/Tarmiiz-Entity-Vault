import { Component, ChangeDetectionStrategy, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalRfqQuoteService } from './modal-rfq-quote.service';

@Component({
  selector: 'app-modal-rfq-quote',
  templateUrl: './modal-rfq-quote.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
})
export class ModalRfqQuoteComponent {
  modalService = inject(ModalRfqQuoteService);

  subscription = signal('');
  price        = signal<number | null>(null);
  error        = signal('');

  /** untracked() — see the standing modal open-effect trap. */
  private readonly resetOnOpen = effect(() => {
    if (!this.modalService.isVisible()) return;
    untracked(() => {
      this.error.set('');
      this.subscription.set(this.modalService.ctx().subscriptions[0]?.address ?? '');
      this.price.set(null);
    });
  });

  /** What answering commits — under Firm funding this is escrowed immediately. */
  notional = computed(() => {
    const p = Number(this.price() ?? 0);
    const a = Number(this.modalService.ctx().amount || 0);
    return p > 0 && a > 0 ? p * a : 0;
  });

  onSubmit(): void {
    this.error.set('');
    const price = Number(this.price() ?? 0);
    if (!this.subscription()) { this.error.set('dex.rfqs.quoteModal.errSubscription'); return; }
    if (!(price > 0))         { this.error.set('dex.rfqs.quoteModal.errPrice');        return; }
    this.modalService.confirm({ subscription: this.subscription(), price });
  }

  onCancel(): void { this.modalService.cancel(); }
}
