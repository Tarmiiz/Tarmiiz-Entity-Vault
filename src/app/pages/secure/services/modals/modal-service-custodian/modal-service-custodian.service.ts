import { Injectable, signal } from '@angular/core';

// Sentinel for self-custody passed to ServiceTemplate.setCustodian.
// The contract substitutes address(this) when it sees this value.
export const SELF_CUSTODY_SENTINEL = '0x0000000000000000000000000000000000000001';

@Injectable({
  providedIn: 'root'
})
export class ModalServiceCustodianService {
  isVisible = signal(false);
  currentCustodian = signal<string>('');
  serviceAddress = signal<string>('');
  regulatorAddress = signal<string>('');

  private resolveFn?: (value: string | null) => void;

  show(serviceAddress: string, currentCustodian: string, regulatorAddress: string): Promise<string | null> {
    const zeroAddr = '0x0000000000000000000000000000000000000000';
    this.serviceAddress.set(serviceAddress);
    this.regulatorAddress.set(regulatorAddress);
    // Normalize: if current points at the service itself, show as self-custody sentinel.
    let initial = currentCustodian;
    if (!initial || initial === zeroAddr) {
      initial = '';
    } else if (initial.toLowerCase() === serviceAddress.toLowerCase()) {
      initial = SELF_CUSTODY_SENTINEL;
    }
    this.currentCustodian.set(initial);
    this.isVisible.set(true);

    return new Promise<string | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(custodian: string): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(custodian);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
