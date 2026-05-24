import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalAssetPriceService } from './modal-asset-price.service';

@Component({
  selector: 'app-modal-asset-price',
  templateUrl: './modal-asset-price.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
})
export class ModalAssetPriceComponent {

  modal = inject(ModalAssetPriceService);
  private fb: FormBuilder = inject(FormBuilder);

  form = this.fb.group({
    bid:   [null as number | null],
    ask:   [null as number | null],
    price: [null as number | null],
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
    });
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
    return true;
  }

  onSave(): void {
    const input = this.modal.input();
    if (!input || !this.isValid()) return;
    const timestamp = Math.floor(Date.now() / 1000);
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
