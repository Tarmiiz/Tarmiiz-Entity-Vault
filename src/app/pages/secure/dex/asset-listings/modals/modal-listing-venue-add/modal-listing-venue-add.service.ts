import { Injectable, signal } from '@angular/core';

export interface ModalListingVenueAddInput {
  asset: string;
  tier: 1 | 2 | 3;
  assetCountryCode?: number;
  assetCountryName?: string;
}

@Injectable({ providedIn: 'root' })
export class ModalListingVenueAddService {
  isVisible = signal(false);
  input     = signal<ModalListingVenueAddInput | null>(null);
  private resolveFn: ((added: boolean) => void) | null = null;

  show(input: ModalListingVenueAddInput): Promise<boolean> {
    this.input.set(input);
    this.isVisible.set(true);
    return new Promise<boolean>(resolve => { this.resolveFn = resolve; });
  }

  hide(added = false) {
    this.isVisible.set(false);
    this.input.set(null);
    if (this.resolveFn) { this.resolveFn(added); this.resolveFn = null; }
  }
}
