import { Injectable, signal } from '@angular/core';
import { DexAssetListing, DexAssetListingVenue } from '../../../../../../shared/models/data.model';

export interface ModalListingVenueTierChangeInput {
  asset: string;
  listing: DexAssetListing;
  venue: DexAssetListingVenue;
}

@Injectable({ providedIn: 'root' })
export class ModalListingVenueTierChangeService {
  isVisible = signal(false);
  input     = signal<ModalListingVenueTierChangeInput | null>(null);
  private resolveFn: ((changed: boolean) => void) | null = null;

  show(input: ModalListingVenueTierChangeInput): Promise<boolean> {
    this.input.set(input);
    this.isVisible.set(true);
    return new Promise<boolean>(resolve => { this.resolveFn = resolve; });
  }

  hide(changed = false) {
    this.isVisible.set(false);
    this.input.set(null);
    if (this.resolveFn) { this.resolveFn(changed); this.resolveFn = null; }
  }
}
