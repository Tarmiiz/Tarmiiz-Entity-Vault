import { Injectable, signal } from '@angular/core';

export interface AddTransactionData {
  trxType: 'Subscribe' | 'Redeem';
  service: string;
  asset: string;
  subscription: string;
  tokens: number;
}

@Injectable({
  providedIn: 'root'
})
export class ModalTransactionAddService {
  isVisible = signal(false);

  private resolveFn?: (value: AddTransactionData | null) => void;

  show(): Promise<AddTransactionData | null> {
    this.isVisible.set(true);
    return new Promise<AddTransactionData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(data: AddTransactionData): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(data);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
