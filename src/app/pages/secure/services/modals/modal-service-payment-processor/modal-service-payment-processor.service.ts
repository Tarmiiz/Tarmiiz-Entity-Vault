import { Injectable, signal } from '@angular/core';

/** One currency this service has DECLARED an election for, with the role that election implies. */
export interface PaymentCurrencyOption {
  currencyCode: number;
  currencyName: string;
  /** ELECTION_ONC = 1 | ELECTION_OFFC = 2 */
  election: number;
  /** Derived, never chosen: PAY_ROLE_MINTER = 2 for onc, PAY_ROLE_RAIL = 1 for offc. */
  payRole: number;
  payRoleName: string;
}

/** What the picker resolves to — a payment attachment is (provider, currency, role), never an address alone. */
export interface PaymentProviderChoice {
  provider: string;
  currencyCode: number;
  payRole: number;
}

@Injectable({
  providedIn: 'root'
})
export class ModalServicePaymentProcessorService {
  isVisible = signal(false);
  currentPaymentProcessor = signal<string>('');
  /** Currencies with a declared election. EMPTY means the attach is impossible — see the modal. */
  currencies = signal<PaymentCurrencyOption[]>([]);
  // Addresses already attached to the service — hidden from the picker (attaching one
  // again is a no-op on-chain, so offering it can only mislead).
  excluded = signal<string[]>([]);

  private resolveFn?: (value: PaymentProviderChoice | null) => void;

  show(currentPaymentProcessor: string, exclude: string[] = [],
       currencies: PaymentCurrencyOption[] = []): Promise<PaymentProviderChoice | null> {
    const zeroAddr = '0x0000000000000000000000000000000000000000';
    this.currentPaymentProcessor.set(currentPaymentProcessor === zeroAddr ? '' : currentPaymentProcessor);
    this.excluded.set(exclude.map(a => a.toLowerCase()));
    this.currencies.set(currencies);
    this.isVisible.set(true);

    return new Promise<PaymentProviderChoice | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(choice: PaymentProviderChoice): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(choice);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
