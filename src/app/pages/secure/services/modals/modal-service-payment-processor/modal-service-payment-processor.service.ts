import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ModalServicePaymentProcessorService {
  isVisible = signal(false);
  currentPaymentProcessor = signal<string>('');

  private resolveFn?: (value: string | null) => void;

  show(currentPaymentProcessor: string): Promise<string | null> {
    const zeroAddr = '0x0000000000000000000000000000000000000000';
    this.currentPaymentProcessor.set(currentPaymentProcessor === zeroAddr ? '' : currentPaymentProcessor);
    this.isVisible.set(true);

    return new Promise<string | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(paymentProcessor: string): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(paymentProcessor);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
