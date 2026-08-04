import { Component, ChangeDetectionStrategy, inject, effect, computed, signal } from '@angular/core';
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

  form = this.fb.group({
    buyFeeMode:     ['0', Validators.required],
    buyFeeValue:    [''],
    buyFeeBearing:  ['0'],
    sellFeeMode:    ['0', Validators.required],
    sellFeeValue:   [''],
    sellFeeBearing: ['0'],
  });

  buyMode  = computed(() => Number(this.form.controls.buyFeeMode.value) || 0);
  sellMode = computed(() => Number(this.form.controls.sellFeeMode.value) || 0);

  constructor() {
    effect(() => {
      const input = this.modal.input();
      if (!input || !this.modal.isVisible()) return;
      this.submitError.set('');
      const fc = input.feeConfig;
      if (!fc) {
        this.form.reset({
          buyFeeMode: '0', buyFeeValue: '', buyFeeBearing: '0',
          sellFeeMode: '0', sellFeeValue: '', sellFeeBearing: '0',
        });
        return;
      }
      this.form.reset({
        buyFeeMode: String(fc.buyFeeMode ?? 0),
        buyFeeValue: this.fromOnChain(fc.buyFeeMode, fc.buyFeeValue),
        buyFeeBearing: String(fc.buyFeeBearing ?? 0),
        sellFeeMode: String(fc.sellFeeMode ?? 0),
        sellFeeValue: this.fromOnChain(fc.sellFeeMode, fc.sellFeeValue),
        sellFeeBearing: String(fc.sellFeeBearing ?? 0),
      });
    });

    this.form.controls.buyFeeMode.valueChanges.subscribe(m => {
      if (m === '0') {
        this.form.controls.buyFeeValue.setValue('');
        this.form.controls.buyFeeBearing.setValue('0');
      }
    });
    this.form.controls.sellFeeMode.valueChanges.subscribe(m => {
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

  validateSide(mode: number, valueStr: string): string {
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
