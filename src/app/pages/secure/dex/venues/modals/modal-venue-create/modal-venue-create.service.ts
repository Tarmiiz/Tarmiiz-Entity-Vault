import { Injectable, signal } from '@angular/core';

/** `settlementMode`: 1 = venue settles its own DvP (sv), 2 = books and matching only (mv). */
export interface VenueCreateResult {
  serviceAddress: string;
  settlementMode: number;
}

@Injectable({ providedIn: 'root' })
export class ModalVenueCreateService {
  isVisible = signal(false);
  private resolveFn?: (value: VenueCreateResult | null) => void;

  show(): Promise<VenueCreateResult | null> {
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(serviceAddress: string, settlementMode: number): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn({ serviceAddress, settlementMode });
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
