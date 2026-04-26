import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalListingCreateService {
  isVisible = signal(false);

  private resolveFn?: (value: { baseAsset: string; venue: boolean; country: boolean; global: boolean } | null) => void;

  show(): Promise<{ baseAsset: string; venue: boolean; country: boolean; global: boolean } | null> {
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(baseAsset: string, venue: boolean, country: boolean, global: boolean): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn({ baseAsset, venue, country, global });
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
