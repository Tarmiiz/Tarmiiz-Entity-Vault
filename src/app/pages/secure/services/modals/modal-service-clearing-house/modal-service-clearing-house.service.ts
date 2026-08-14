import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ModalServiceClearingHouseService {
  isVisible = signal(false);
  currentClearingHouse = signal<string>('');
  // Addresses already attached to the service — hidden from the picker (attaching one
  // again is a no-op on-chain, so offering it can only mislead).
  excluded = signal<string[]>([]);

  private resolveFn?: (value: string | null) => void;

  show(currentClearingHouse: string, exclude: string[] = []): Promise<string | null> {
    const zeroAddr = '0x0000000000000000000000000000000000000000';
    this.currentClearingHouse.set(currentClearingHouse === zeroAddr ? '' : currentClearingHouse);
    this.excluded.set(exclude.map(a => a.toLowerCase()));
    this.isVisible.set(true);

    return new Promise<string | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(clearingHouse: string): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(clearingHouse);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
