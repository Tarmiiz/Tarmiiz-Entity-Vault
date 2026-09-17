import { Component, ChangeDetectionStrategy, inject, effect, untracked } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalAttestationService, AttestationModalResult } from './modal-attestation.service';

const SCHEMA_NAV       = 'tarmiiz.nav-attestation.v1';
const SCHEMA_PORTFOLIO = 'tarmiiz.portfolio-attestation.v1';

@Component({
  selector: 'app-modal-attestation',
  templateUrl: './modal-attestation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalAttestationComponent {

  modal = inject(ModalAttestationService);
  private fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    row:        [38 as 37 | 38],
    asOf:       ['', [Validators.required]],          // datetime-local
    attestedBy: [''],
    // row 38
    bid:        [''],
    ask:        [''],
    // row 37 — one holding per line: instrument | custodian | location | segregated(y/n) | quantity | value
    lines:      [''],
    cashAtDepositary: [''],
  });

  constructor() {
    effect(() => {
      const input = this.modal.input();
      if (!input || !this.modal.isVisible()) return;
      untracked(() => this.form.reset({ row: input.row, asOf: '', attestedBy: '', bid: '', ask: '', lines: '', cashAtDepositary: '' }));
    });
  }

  isNav(): boolean { return Number(this.form.controls.row.value) === 38; }

  private asOfSeconds(): number | null {
    const v = this.form.controls.asOf.value;
    const ms = v ? Date.parse(v) : NaN;
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }

  /** Parse the portfolio lines textarea; null when any line is malformed. */
  private parseLines(): Record<string, any>[] | null {
    const raw = this.form.controls.lines.value || '';
    const out: Record<string, any>[] = [];
    for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
      const [instrument, custodian, location, segregated, quantity, value] = line.split('|').map(s => s.trim());
      if (!instrument || !Number.isFinite(Number(value))) return null;
      out.push({
        instrument, custodian: custodian || '', location: location || '',
        segregated: /^(y|yes|true|1)$/i.test(segregated || ''),
        quantity: quantity !== undefined && quantity !== '' ? Number(quantity) : null,
        value: Number(value),
      });
    }
    return out;
  }

  private build(): AttestationModalResult | null {
    const asOf = this.asOfSeconds();
    if (asOf === null) return null;
    const row = Number(this.form.controls.row.value) as 37 | 38;
    const attestedBy = (this.form.controls.attestedBy.value || '').trim() || undefined;
    if (row === 38) {
      const bid = Number(this.form.controls.bid.value), ask = Number(this.form.controls.ask.value);
      if (!(bid >= 0) || !(ask >= bid) || this.form.controls.bid.value === '' || this.form.controls.ask.value === '') return null;
      return { row, attestedBy, attestation: { schema: SCHEMA_NAV, asOf, nav: { bid, ask } } };
    }
    const lines = this.parseLines();
    if (!lines) return null;
    const cashRaw = this.form.controls.cashAtDepositary.value;
    const attestation: Record<string, any> = { schema: SCHEMA_PORTFOLIO, asOf, lines };
    if (cashRaw !== '') {
      if (!Number.isFinite(Number(cashRaw))) return null;
      attestation['cash'] = { atDepositary: Number(cashRaw) };
    }
    return { row, attestedBy, attestation };
  }

  isValid(): boolean { return this.build() !== null; }

  onSave(): void {
    const r = this.build();
    if (r) this.modal.confirm(r);
  }

  onCancel(): void { this.modal.cancel(); }
}
