import { Injectable, signal } from '@angular/core';

// Result of the Path B (Register Existing Asset) modal. `address` is the
// pre-deployed contract address the issuer wants to admit into the platform.
// The modal itself runs preview + registration via ApiService; on success we
// resolve with `{ address, registered: true }` so the list page can refresh.
export interface RegisterExistingResult {
  address: string;
  registered: boolean;
}

@Injectable({ providedIn: 'root' })
export class ModalAssetRegisterExistingService {
  isVisible = signal(false);

  private resolveFn?: (value: RegisterExistingResult | null) => void;

  show(): Promise<RegisterExistingResult | null> {
    this.isVisible.set(true);
    return new Promise<RegisterExistingResult | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(result: RegisterExistingResult): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(result);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
