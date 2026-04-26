import { Injectable, signal } from '@angular/core';

export interface PlaceOrderResult {
  subscription: string;
  dexService: string;
  baseAsset: string;
  side: number;
  marketScope: number;
  price: string;   // wei string
  amount: string;  // plain integer string
}

@Injectable({ providedIn: 'root' })
export class ModalPlaceOrderService {
  isVisible = signal(false);

  private resolveFn?: (value: PlaceOrderResult | null) => void;

  show(): Promise<PlaceOrderResult | null> {
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(value: PlaceOrderResult): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(value);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
