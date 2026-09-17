import { Component, ChangeDetectionStrategy, inject, effect, untracked } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalDealingConfigService, DealingConfig, DealingSide } from './modal-dealing-config.service';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

@Component({
  selector: 'app-modal-dealing-config',
  templateUrl: './modal-dealing-config.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalDealingConfigComponent {

  modal = inject(ModalDealingConfigService);
  private fb = inject(FormBuilder);

  readonly weekdays = WEEKDAYS;

  form = this.fb.nonNullable.group({
    tz:            ['Africa/Cairo', [Validators.required]],
    valuationTime: ['14:00', [Validators.required, Validators.pattern(HHMM)]],
    buyDaily:      [true],
    buyDays:       this.fb.nonNullable.group(Object.fromEntries(WEEKDAYS.map(d => [d, false])) as Record<string, boolean>),
    buyCutoff:     ['10:00', [Validators.required, Validators.pattern(HHMM)]],
    buyDayBefore:  [false],
    sellDaily:     [true],
    sellDays:      this.fb.nonNullable.group(Object.fromEntries(WEEKDAYS.map(d => [d, false])) as Record<string, boolean>),
    sellCutoff:    ['10:00', [Validators.required, Validators.pattern(HHMM)]],
    sellDayBefore: [false],
  });

  constructor() {
    // Reset from the current model on open. `untracked` — writing the form inside a tracked
    // effect that reads the same signals would loop it (the platform's modal-reset rule).
    effect(() => {
      if (!this.modal.isVisible()) return;
      const cur = this.modal.current();
      untracked(() => this.resetFrom(cur));
    });
  }

  private resetFrom(cur: DealingConfig | null): void {
    const side = (s: DealingSide | undefined) => ({
      daily: !s || s.days === 'daily',
      days: Object.fromEntries(WEEKDAYS.map(d => [d, Array.isArray(s?.days) && s!.days.includes(d)])) as Record<string, boolean>,
      cutoff: s?.cutoff ?? '10:00',
      dayBefore: s?.cutoffDayBefore === true,
    });
    const b = side(cur?.buy), s = side(cur?.sell);
    this.form.reset({
      tz: cur?.tz ?? 'Africa/Cairo',
      valuationTime: cur?.valuationTime ?? '14:00',
      buyDaily: b.daily, buyDays: b.days, buyCutoff: b.cutoff, buyDayBefore: b.dayBefore,
      sellDaily: s.daily, sellDays: s.days, sellCutoff: s.cutoff, sellDayBefore: s.dayBefore,
    });
  }

  private sideOf(daily: boolean, days: Record<string, boolean>, cutoff: string, dayBefore: boolean): DealingSide | null {
    const list = WEEKDAYS.filter(d => days[d]);
    if (!daily && list.length === 0) return null;
    return { days: daily ? 'daily' : list, cutoff, cutoffDayBefore: dayBefore };
  }

  /** The normalized config the form describes, or null while it is invalid. */
  value(): DealingConfig | null {
    if (!this.form.valid) return null;
    const v = this.form.getRawValue();
    const buy = this.sideOf(v.buyDaily, v.buyDays, v.buyCutoff, v.buyDayBefore);
    const sell = this.sideOf(v.sellDaily, v.sellDays, v.sellCutoff, v.sellDayBefore);
    if (!buy || !sell) return null;
    return { tz: v.tz.trim(), valuationTime: v.valuationTime, buy, sell };
  }

  isValid(): boolean { return this.value() !== null; }

  onSave(): void {
    const config = this.value();
    if (!config) return;
    this.modal.confirm({ config });
  }

  onClear(): void { this.modal.confirm({ clear: true }); }

  onCancel(): void { this.modal.cancel(); }
}
