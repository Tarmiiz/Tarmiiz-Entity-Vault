import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalDistributionDeclareService, DeclareDistributionData } from './modal-distribution-declare.service';

// Declare a distribution on the asset. Two flavours:
//   • Credit dividend (distType=1) — pays out credit in the asset's own currency.
//     The issuer MUST pre-fund the asset's credit account with `amount` BEFORE
//     declaring; failed legs surface during execute and are retryable.
//   • Stock split  (distType=2) — issues additional asset units pro-rata.
//     Dynamic supply mints to holders; Fixed supply transfers from the asset's
//     own reserve (which the issuer is expected to have pre-allocated).
@Component({
  selector: 'app-modal-distribution-declare',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './modal-distribution-declare.component.html',
})
export class ModalDistributionDeclareComponent {
  svc = inject(ModalDistributionDeclareService);

  distType       = signal<1 | 2>(1);
  amount         = signal<string>('');
  recordBlock    = signal<string>('');   // empty → 0 → "current block at declare"
  sweepResidual  = signal<boolean>(true);
  error          = signal<string>('');

  // Amount is entered in WHOLE UNITS for both types (the API wei-encodes the Credit
  // side). So a Credit dividend may be fractional — the old BigInt() check rejected
  // "100.50" outright — while a StockSplit is a token count and stays a whole number.
  canConfirm = computed(() => {
    const a = this.amount().trim();
    if (!a) return false;
    const n = Number(a);
    if (!Number.isFinite(n) || n <= 0) return false;
    return this.distType() === 1 ? true : /^\d+$/.test(a);
  });

  confirm() {
    this.error.set('');
    const data: DeclareDistributionData = {
      distType:      this.distType(),
      amount:        this.amount().trim(),
      recordBlock:   Number(this.recordBlock() || 0),
      sweepResidual: this.distType() === 1 ? this.sweepResidual() : false,
    };
    this.svc.confirm(data);
    this.reset();
  }

  cancel() {
    this.svc.cancel();
    this.reset();
  }

  private reset() {
    this.distType.set(1);
    this.amount.set('');
    this.recordBlock.set('');
    this.sweepResidual.set(true);
    this.error.set('');
  }
}
