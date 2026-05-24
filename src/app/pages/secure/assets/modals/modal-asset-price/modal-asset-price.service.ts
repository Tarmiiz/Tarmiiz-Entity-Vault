import { Injectable, signal } from '@angular/core';

export interface AssetPriceModalInput {
  // priceMode is the source of truth for which form to show.
  // 1 = Single (single price; bid == ask), 2 = BidAsk (separate bid + ask)
  priceMode: number;
  // supplyMode: 1 = Fixed, 2 = Dynamic. Post-T20Template-consolidation rename of the
  // old leaf-template `tokenType` distinction at this level.
  supplyMode: number;
  symbol: string;
  currentBid?: number;
  currentAsk?: number;
}

export interface AssetPriceModalResult {
  // Always emits both bid and ask. Single mode sets bid = ask.
  bid: number;
  ask: number;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class ModalAssetPriceService {
  isVisible = signal(false);
  input = signal<AssetPriceModalInput | null>(null);

  private resolveFn?: (value: AssetPriceModalResult | null) => void;

  show(input: AssetPriceModalInput): Promise<AssetPriceModalResult | null> {
    this.input.set(input);
    this.isVisible.set(true);
    return new Promise<AssetPriceModalResult | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(result: AssetPriceModalResult): void {
    this.isVisible.set(false);
    this.resolveFn?.(result);
  }

  cancel(): void {
    this.isVisible.set(false);
    this.resolveFn?.(null);
  }
}
