import { Injectable, signal } from '@angular/core';

export interface PlaceOrderResult {
  subscription: string;
  dexService: string;
  baseAsset: string;
  side: number;
  price: string;   // wei string
  amount: string;  // plain integer string
  // Time in force. Unix SECONDS (the chain's + the API's unit), 0 = good-till-cancelled.
  // NOT the milliseconds the order row reports back — the two units meet on this feature and
  // conflating them yields a deadline ~1000x in the future, i.e. a silent GTC.
  expiresAt: number;
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
