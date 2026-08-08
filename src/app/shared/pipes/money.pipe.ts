import { Pipe, PipeTransform, inject } from '@angular/core';
import { FeaturesService } from '../services/features.service';

/**
 * Renders a MONEY value at the tenant's configured precision (Entity API app_config
 * `CURRENCY_DECIMALS`, served on /vault/features[/me], admin-editable from System
 * Configuration). Replaces the hardcoded `| number:'1.6-6'` / `'1.2-2'` / `'1.0-6'`
 * bindings on every price, total, credit amount, balance, obligation and AUM.
 *
 * NOT for token quantities — those are plain integers platform-wide and keep their own
 * `number:'1.0-0'` / `'1.0-2'` bindings. Nor for percentages.
 *
 * Output is byte-identical to `number:'1.N-N'` at the same N: the app registers no
 * locale, so Angular's default LOCALE_ID is en-US and `toLocaleString('en-US', …)` emits
 * the same grouping. Null / non-finite renders empty, matching the number pipe.
 *
 * `pure: false` because the precision comes from a service, not the input — a pure pipe
 * would cache its first render and never pick up either the /features response (which lands
 * after the first paint) or an admin's live edit on the System Configuration page. The
 * 1-entry memo makes the repeat calls of every change-detection cycle a reference compare,
 * so a long table costs one format per cell per actual change, not one per tick.
 */
@Pipe({ name: 'money', standalone: true, pure: false })
export class MoneyPipe implements PipeTransform {
  private features = inject(FeaturesService);

  private lastValue: unknown = Symbol('unset');
  private lastDecimals = -1;
  private lastOut = '';

  transform(value: number | string | null | undefined): string {
    const decimals = this.features.currencyDecimals();
    if (value === this.lastValue && decimals === this.lastDecimals) return this.lastOut;

    this.lastValue = value;
    this.lastDecimals = decimals;

    if (value === null || value === undefined || value === '') {
      this.lastOut = '';
      return this.lastOut;
    }
    const n = Number(value);
    this.lastOut = Number.isFinite(n)
      ? n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : '';
    return this.lastOut;
  }
}
