import { Component, ChangeDetectionStrategy, inject, effect, computed, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ethers } from 'ethers';

import { ModalAssetFeeConfigService } from './modal-asset-fee-config.service';
import { FeeConfig } from '../../../../../shared/models/data.model';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

/**
 * Fee mode: 0 = None, 1 = Bps, 2 = Fixed.
 *
 * On-chain encoding:
 * - Bps value is a plain integer (0-2000, cap 20%).
 * - Fixed value is wei (UI takes a decimal amount and multiplies by 1e18 on submit).
 * - None: value = '0', destination = ZERO_ADDR.
 */
@Component({
  selector: 'app-modal-asset-fee-config',
  templateUrl: './modal-asset-fee-config.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalAssetFeeConfigComponent {

  modal = inject(ModalAssetFeeConfigService);
  private fb: FormBuilder = inject(FormBuilder);

  // Track whether the user has touched the form so we can decide if a stale-input
  // warning should display (e.g. None mode with a non-zero value entered).
  submitError = signal<string>('');

  form = this.fb.group({
    buyFeeMode:        ['0', Validators.required],
    buyFeeValue:       [''],
    buyFeeDestination: [ZERO_ADDR],
    sellFeeMode:        ['0', Validators.required],
    sellFeeValue:       [''],
    sellFeeDestination: [ZERO_ADDR],
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
          buyFeeMode: '0', buyFeeValue: '', buyFeeDestination: ZERO_ADDR,
          sellFeeMode: '0', sellFeeValue: '', sellFeeDestination: ZERO_ADDR,
        });
        return;
      }
      this.form.reset({
        buyFeeMode: String(fc.buyFeeMode ?? 0),
        buyFeeValue: this.fromOnChain(fc.buyFeeMode, fc.buyFeeValue),
        buyFeeDestination: fc.buyFeeDestination || ZERO_ADDR,
        sellFeeMode: String(fc.sellFeeMode ?? 0),
        sellFeeValue: this.fromOnChain(fc.sellFeeMode, fc.sellFeeValue),
        sellFeeDestination: fc.sellFeeDestination || ZERO_ADDR,
      });
    });

    // Reset values whenever the mode flips so leftover input doesn't bleed
    // through to a now-incompatible mode.
    this.form.controls.buyFeeMode.valueChanges.subscribe(m => {
      if (m === '0') {
        this.form.controls.buyFeeValue.setValue('');
        this.form.controls.buyFeeDestination.setValue(ZERO_ADDR);
      }
    });
    this.form.controls.sellFeeMode.valueChanges.subscribe(m => {
      if (m === '0') {
        this.form.controls.sellFeeValue.setValue('');
        this.form.controls.sellFeeDestination.setValue(ZERO_ADDR);
      }
    });
  }

  /** Convert a stored on-chain value back to what the form shows. */
  private fromOnChain(mode: number | undefined, value: string | undefined): string {
    if (!mode || !value) return '';
    if (Number(mode) === 2) {
      try { return ethers.formatEther(value); } catch { return value; }
    }
    return String(value);
  }

  private isAddress(v: string): boolean {
    try { return !!v && ethers.isAddress(v); } catch { return false; }
  }

  validateSide(mode: number, valueStr: string, dest: string): string {
    if (mode === 0) {
      if (valueStr && valueStr !== '0') return 'When mode is None, value must be empty or 0.';
      if (dest && dest !== ZERO_ADDR) return 'When mode is None, destination must be the zero address.';
      return '';
    }
    if (!this.isAddress(dest) || dest === ZERO_ADDR) return 'A non-zero destination address is required.';
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
    if (this.validateSide(Number(v.buyFeeMode),  v.buyFeeValue  ?? '', v.buyFeeDestination  ?? '')) return false;
    if (this.validateSide(Number(v.sellFeeMode), v.sellFeeValue ?? '', v.sellFeeDestination ?? '')) return false;
    return true;
  }

  private toOnChain(mode: number, valueStr: string): string {
    if (mode === 0) return '0';
    if (mode === 2) {
      // decimal → wei
      try { return ethers.parseEther(String(valueStr)).toString(); } catch { return '0'; }
    }
    // Bps: plain integer string
    return String(Math.trunc(Number(valueStr)));
  }

  onSave(): void {
    if (!this.isValid()) return;
    const v = this.form.value;
    const buyMode  = Number(v.buyFeeMode);
    const sellMode = Number(v.sellFeeMode);
    const feeConfig: FeeConfig = {
      buyFeeMode:        buyMode,
      buyFeeValue:       this.toOnChain(buyMode,  v.buyFeeValue  ?? ''),
      buyFeeDestination: buyMode === 0  ? ZERO_ADDR : (v.buyFeeDestination  ?? ZERO_ADDR),
      sellFeeMode:       sellMode,
      sellFeeValue:      this.toOnChain(sellMode, v.sellFeeValue ?? ''),
      sellFeeDestination: sellMode === 0 ? ZERO_ADDR : (v.sellFeeDestination ?? ZERO_ADDR),
    };
    this.modal.confirm({ feeConfig });
  }

  onCancel(): void { this.modal.cancel(); }
}
