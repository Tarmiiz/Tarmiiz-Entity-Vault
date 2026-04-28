import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalListingCreateService {
  isVisible = signal(false);
  // Optional preset asset address — when provided, the modal locks the asset dropdown to this value
  // (used when invoked from an asset-details page).
  presetAsset = signal<string>('');

  private resolveFn?: (value: { baseAsset: string; venue: boolean; country: boolean; global: boolean } | null) => void;

  show(opts?: { presetAsset?: string }): Promise<{ baseAsset: string; venue: boolean; country: boolean; global: boolean } | null> {
    this.presetAsset.set(opts?.presetAsset || '');
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(baseAsset: string, venue: boolean, country: boolean, global: boolean): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn({ baseAsset, venue, country, global });
  }

  cancel(): void {
    this.isVisible.set(false);
    this.presetAsset.set('');
    if (this.resolveFn) this.resolveFn(null);
  }
}
