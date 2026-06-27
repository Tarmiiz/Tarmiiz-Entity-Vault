import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalAssetSupplyService } from './modal-asset-supply.service';

@Component({
  selector: 'app-modal-asset-supply',
  templateUrl: './modal-asset-supply.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
})
export class ModalAssetSupplyComponent {

  modal = inject(ModalAssetSupplyService);
  private fb: FormBuilder = inject(FormBuilder);

  form = this.fb.group({
    tokens: [null as number | null, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    effect(() => {
      if (!this.modal.input() || !this.modal.isVisible()) return;
      this.form.reset({ tokens: null });
    });
  }

  isValid(): boolean {
    if (!this.form.valid) return false;
    const input = this.modal.input();
    if (!input) return false;
    const tokens = Number(this.form.value.tokens);
    if (!Number.isInteger(tokens) || tokens < 1) return false;
    if (input.mode === 'burn' && input.available != null && tokens > input.available) return false;
    return true;
  }

  overCap(): boolean {
    const input = this.modal.input();
    const tokens = Number(this.form.value.tokens);
    return !!(input && input.mode === 'burn' && input.available != null && tokens > input.available);
  }

  onSave(): void {
    if (!this.isValid()) return;
    this.modal.confirm({ tokens: Number(this.form.value.tokens) });
  }

  onCancel(): void { this.modal.cancel(); }
}
