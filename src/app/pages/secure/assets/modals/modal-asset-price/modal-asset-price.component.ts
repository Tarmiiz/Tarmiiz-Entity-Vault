import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalAssetPriceService } from './modal-asset-price.service';

@Component({
  selector: 'app-modal-asset-price',
  templateUrl: './modal-asset-price.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalAssetPriceComponent {

  modal = inject(ModalAssetPriceService);
  private fb: FormBuilder = inject(FormBuilder);

  form = this.fb.group({
    bid:   [null as number | null],
    ask:   [null as number | null],
    price: [null as number | null],
    // Optional EFFECTIVE time (Phase 36 A.7) as a datetime-local string; empty = now. It is the
    // instant that releases a forward-priced asset's parked orders, so on such an asset the
    // operator is told to set it to the valuation point.
    effectiveAt: [''],
  });

  constructor() {
    effect(() => {
      const input = this.modal.input();
      if (!input || !this.modal.isVisible()) return;
      // priceMode 2 = Bid/Ask, priceMode 1 = Single
      if (input.priceMode === 2) {
        this.form.controls.bid.setValidators([Validators.required, Validators.min(0)]);
        this.form.controls.ask.setValidators([Validators.required, Validators.min(0)]);
        this.form.controls.price.clearValidators();
        this.form.patchValue({
          bid:   input.currentBid   ?? null,
          ask:   input.currentAsk   ?? null,
          price: null,
        });
      } else {
        this.form.controls.price.setValidators([Validators.required, Validators.min(0)]);
        this.form.controls.bid.clearValidators();
        this.form.controls.ask.clearValidators();
        this.form.patchValue({
          bid:   null,
          ask:   null,
          price: input.currentBid ?? null,
        });
      }
      this.form.controls.bid.updateValueAndValidity();
      this.form.controls.ask.updateValueAndValidity();
      this.form.controls.price.updateValueAndValidity();
      this.form.controls.effectiveAt.setValue('');
    });
  }

  /** The effective instant in unix SECONDS: the field when set (and parseable), else now. */
  private effectiveTimestamp(): number {
    const v = this.form.value.effectiveAt;
    if (v) {
      const ms = Date.parse(v);
      if (Number.isFinite(ms)) return Math.floor(ms / 1000);
    }
    return Math.floor(Date.now() / 1000);
  }

  isValid(): boolean {
    if (!this.form.valid) return false;
    const input = this.modal.input();
    if (!input) return false;
    if (input.priceMode === 2) {
      const bid = Number(this.form.value.bid);
      const ask = Number(this.form.value.ask);
      if (!(ask >= bid)) return false;
    }
    const eff = this.form.value.effectiveAt;
    if (eff && !Number.isFinite(Date.parse(eff))) return false;
    return true;
  }

  onSave(): void {
    const input = this.modal.input();
    if (!input || !this.isValid()) return;
    const timestamp = this.effectiveTimestamp();
    if (input.priceMode === 2) {
      const bid = Number(this.form.value.bid);
      const ask = Number(this.form.value.ask);
      this.modal.confirm({ bid, ask, timestamp });
    } else {
      const price = Number(this.form.value.price);
      this.modal.confirm({ bid: price, ask: price, timestamp });
    }
  }

  onCancel(): void { this.modal.cancel(); }
}
