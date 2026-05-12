import { Injectable, signal } from '@angular/core';

export interface AssetPriceModalInput {
  tokenType: number;
  symbol: string;
  currentBid?: number;
  currentAsk?: number;
  currentNav?: number;
}

export interface AssetPriceModalResult {
  bid?: number;
  ask?: number;
  price?: number;
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
