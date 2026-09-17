import { Injectable, signal } from '@angular/core';

/**
 * The forward-pricing dealing model an asset declares (Phase 36 A.7, ruling D1) — a server-owned
 * reserved key `dealing` in the asset's metadata, written through PUT /assets/:address/dealing.
 * Absent = spot pricing. Times are HH:mm in `tz`; `days` is 'daily' or a list of MON..SUN.
 */
export interface DealingSide {
  days: 'daily' | string[];
  cutoff: string;
  cutoffDayBefore: boolean;
}

export interface DealingConfig {
  tz: string;
  valuationTime: string;
  buy: DealingSide;
  sell: DealingSide;
}

/** `null` = cancelled; `{ clear: true }` = remove the model (back to spot). */
export type DealingModalResult = { config: DealingConfig } | { clear: true } | null;

@Injectable({ providedIn: 'root' })
export class ModalDealingConfigService {
  isVisible = signal(false);
  current = signal<DealingConfig | null>(null);
  symbol = signal<string>('');

  private resolveFn?: (value: DealingModalResult) => void;

  show(symbol: string, current: DealingConfig | null): Promise<DealingModalResult> {
    this.symbol.set(symbol);
    this.current.set(current);
    this.isVisible.set(true);
    return new Promise<DealingModalResult>((resolve) => { this.resolveFn = resolve; });
  }

  confirm(result: DealingModalResult): void {
    this.isVisible.set(false);
    this.resolveFn?.(result);
  }

  cancel(): void {
    this.isVisible.set(false);
    this.resolveFn?.(null);
  }
}
