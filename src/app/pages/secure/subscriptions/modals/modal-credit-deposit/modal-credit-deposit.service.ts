import { Injectable, signal } from '@angular/core';

import { CreditBalance } from '../../../../../shared/models/data.model';

@Injectable({ providedIn: 'root' })
export class ModalCreditDepositService {
  isVisible = signal(false);
  subscriptionAddress = signal<string>('');
  service = signal<string>('');
  paymentProcessor = signal<string>('');
  currencies = signal<CreditBalance[]>([]);

  private resolveFn?: (value: { txHash: string } | null) => void;

  show(input: { subscriptionAddress: string; service: string; paymentProcessor: string; currencies: CreditBalance[] }): Promise<{ txHash: string } | null> {
    this.subscriptionAddress.set(input.subscriptionAddress);
    this.service.set(input.service);
    this.paymentProcessor.set(input.paymentProcessor);
    this.currencies.set(input.currencies);
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(txHash: string): void {
    this.isVisible.set(false);
    this.resolveFn?.({ txHash });
  }

  cancel(): void {
    this.isVisible.set(false);
    this.resolveFn?.(null);
  }
}
