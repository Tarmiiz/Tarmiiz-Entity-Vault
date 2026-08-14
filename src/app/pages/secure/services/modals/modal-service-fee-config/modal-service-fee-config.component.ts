import { Component, ChangeDetectionStrategy, inject, effect, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ethers } from 'ethers';

import { ModalServiceFeeConfigService } from './modal-service-fee-config.service';
import { FeeConfig } from '../../../../../shared/models/data.model';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

/**
 * Service fee config — the uniform D7b engine (2026-08-03). Keyed by
 * (this service, asset); THE only fee surface on the platform (the asset-side
 * per-service fee config was removed with the issuer/DEX model redesign).
 *
 * Each side carries { mode, value, bearing }:
 *   mode:    0 = None, 1 = Bps (1-2000 = 0.01%-20%), 2 = Fixed (currency units)
 *   bearing: 0 = OnTop (payer pays gross + fee), 1 = Deducted (receiver gets gross − fee)
 *
 * No destination inputs — the contract FORCES the destination to this service's
 * own account (caller-supplied values are ignored on-chain).
 */
@Component({
  selector: 'app-modal-service-fee-config',
  templateUrl: './modal-service-fee-config.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalServiceFeeConfigComponent {

  modal = inject(ModalServiceFeeConfigService);
  private fb: FormBuilder = inject(FormBuilder);

  submitError = signal<string>('');
  // True while the form is showing an INHERITED value the operator has not changed.
  inheriting = signal<boolean>(false);
  dirty = signal<boolean>(false);

  form = this.fb.group({
    buyFeeMode:     ['0', Validators.required],
    buyFeeValue:    [''],
    buyFeeBearing:  ['0'],
    sellFeeMode:    ['0', Validators.required],
    sellFeeValue:   [''],
    sellFeeBearing: ['0'],
  });

  // Mirrors of the two mode controls. Signals, NOT computed() over control.value — a
  // reactive-form value is not a signal, so a computed over it has no dependency to
  // invalidate on: it caches its first read forever and the Value/Bearing inputs the
  // template gates on it never appear again after an open that showed None.
  buyMode  = signal(0);
  sellMode = signal(0);

  constructor() {
    effect(() => {
      const input = this.modal.input();
      if (!input || !this.modal.isVisible()) return;
      this.submitError.set('');
      this.dirty.set(false);
      // When this asset currently INHERITS, pre-fill from the service default so the operator
      // sees what is actually being charged — but remember it, so Save can stay disabled
      // until something changes. Opening and saving an inherited row must NOT silently pin
      // an override.
      const inheriting = input.mode !== 'default' && input.isSet === false;
      this.inheriting.set(inheriting);
      const fc = input.feeConfig ?? (inheriting ? (input.inherited ?? null) : null);
      if (!fc) {
        // emitEvent: false — a pre-fill is not an operator edit. Letting reset() emit
        // would flip `dirty` on open and defeat the inherited-row guard below.
        this.form.reset({
          buyFeeMode: '0', buyFeeValue: '', buyFeeBearing: '0',
          sellFeeMode: '0', sellFeeValue: '', sellFeeBearing: '0',
        }, { emitEvent: false });
        this.buyMode.set(0);
        this.sellMode.set(0);
        return;
      }
      this.form.reset({
        buyFeeMode: String(fc.buyFeeMode ?? 0),
        buyFeeValue: this.fromOnChain(fc.buyFeeMode, fc.buyFeeValue),
        buyFeeBearing: String(fc.buyFeeBearing ?? 0),
        sellFeeMode: String(fc.sellFeeMode ?? 0),
        sellFeeValue: this.fromOnChain(fc.sellFeeMode, fc.sellFeeValue),
        sellFeeBearing: String(fc.sellFeeBearing ?? 0),
      }, { emitEvent: false });
      this.buyMode.set(Number(fc.buyFeeMode ?? 0) || 0);
      this.sellMode.set(Number(fc.sellFeeMode ?? 0) || 0);
    });

    this.form.valueChanges.subscribe(() => this.dirty.set(true));

    this.form.controls.buyFeeMode.valueChanges.subscribe(m => {
      this.buyMode.set(Number(m) || 0);
      if (m === '0') {
        this.form.controls.buyFeeValue.setValue('');
        this.form.controls.buyFeeBearing.setValue('0');
      }
    });
    this.form.controls.sellFeeMode.valueChanges.subscribe(m => {
      this.sellMode.set(Number(m) || 0);
      if (m === '0') {
        this.form.controls.sellFeeValue.setValue('');
        this.form.controls.sellFeeBearing.setValue('0');
      }
    });
  }

  private fromOnChain(mode: number | undefined, value: string | undefined): string {
    if (!mode || !value) return '';
    if (Number(mode) === 2) {
      try { return ethers.formatEther(value); } catch { return value; }
    }
    return String(value);
  }

  // The DEFAULT slot rejects Fixed on chain: `gross` is certificates x price on the primary
  // market but amount x price with no 1e18 division on the DEX, so one fixed number cannot be
  // right in both roles the single slot serves. Say so here rather than surfacing a revert.
  isDefaultMode(): boolean { return this.modal.input()?.mode === 'default'; }

  validateSide(mode: number, valueStr: string): string {
    if (this.isDefaultMode() && mode === 2) {
      return 'A Fixed fee cannot be used as the service default — set it on the asset instead.';
    }
    if (mode === 0) {
      if (valueStr && valueStr !== '0') return 'When mode is None, value must be empty or 0.';
      return '';
    }
    const num = Number(valueStr);
    if (!Number.isFinite(num) || num <= 0) return 'Value must be greater than 0.';
    if (mode === 1) {
      if (!Number.isInteger(num)) return 'Bps value must be an integer.';
      if (num < 1 || num > 2000) return 'Bps value must be between 1 and 2000 (max 20%).';
    }
    return '';
  }

  isValid(): boolean {
    // An inherited row needs an actual edit before it can be saved — see the pre-fill note.
    if (this.inheriting() && !this.dirty()) return false;
    const v = this.form.value;
    if (this.validateSide(Number(v.buyFeeMode),  v.buyFeeValue  ?? '')) return false;
    if (this.validateSide(Number(v.sellFeeMode), v.sellFeeValue ?? '')) return false;
    return true;
  }

  private toOnChain(mode: number, valueStr: string): string {
    if (mode === 0) return '0';
    if (mode === 2) {
      try { return ethers.parseEther(String(valueStr)).toString(); } catch { return '0'; }
    }
    return String(Math.trunc(Number(valueStr)));
  }

  onSave(): void {
    if (!this.isValid()) return;
    const v = this.form.value;
    const buyMode  = Number(v.buyFeeMode);
    const sellMode = Number(v.sellFeeMode);
    // Destinations are FORCED on-chain to the configuring service; send zero and
    // let the contract stamp its own address on non-None sides.
    const feeConfig: FeeConfig = {
      buyFeeMode:         buyMode,
      buyFeeValue:        this.toOnChain(buyMode,  v.buyFeeValue  ?? ''),
      buyFeeDestination:  ZERO_ADDR,
      buyFeeBearing:      buyMode === 0 ? 0 : Number(v.buyFeeBearing ?? 0),
      sellFeeMode:        sellMode,
      sellFeeValue:       this.toOnChain(sellMode, v.sellFeeValue ?? ''),
      sellFeeDestination: ZERO_ADDR,
      sellFeeBearing:     sellMode === 0 ? 0 : Number(v.sellFeeBearing ?? 0),
    };
    this.modal.confirm({ feeConfig });
  }

  onCancel(): void { this.modal.cancel(); }
}
