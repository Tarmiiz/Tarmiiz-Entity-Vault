import { Injectable, signal } from '@angular/core';

export interface AddServiceData {
  name: string;
  description: string;
  website: string;
  email: string;
  mobile: string;
  verificationLevel: number;
  serviceType: number;
  // Entity-declared sub-type for service providers (1=Validator,2=PaymentProcessor,3=Custodian,4=ClearingHouse; 0=issuer).
  providerType: number;
  regulator: string;
  validator: string;
  paymentProcessor: string;
  custodian: string;
  // Optional, type-1 only. Empty = none, which is MEANINGFUL rather than missing: no clearing
  // house means this market's credit is final and every fill settles immediately.
  clearingHouse: string;
  visibility: number;
}

// Sentinel for self-custody at serviceCreate; ServiceTemplate substitutes address(this) at init.
export const SELF_CUSTODY_SENTINEL = '0x0000000000000000000000000000000000000001';

@Injectable({
  providedIn: 'root'
})
export class ModalServiceAddService {
  isVisible = signal(false);

  private resolveFn?: (value: AddServiceData | null) => void;

  show(): Promise<AddServiceData | null> {
    this.isVisible.set(true);
    return new Promise<AddServiceData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(data: AddServiceData): void {
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
