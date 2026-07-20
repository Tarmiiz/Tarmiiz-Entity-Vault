import { Injectable, signal } from '@angular/core';

export interface ContactSeed {
  email: string;
  phone: string;
  website: string;
  address: string;
}

export interface MetadataEditSeed {
  /** Modal heading, e.g. "Edit Asset Metadata". */
  title: string;
  /** Current description (the reserved `description` key). */
  description: string;
  /** Current public contact info (the reserved `contact` key). */
  contact: ContactSeed;
  /** Current custom key/value pairs (everything except `description` / `contact` / `media`). */
  entries: [string, string][];
}

/**
 * Shared free-form metadata editor (description + contact + arbitrary key/value rows).
 * Returns the assembled metadata object `{ description, contact, ...customKV }`, or null on cancel.
 * Used by both the asset and service detail pages.
 */
@Injectable({ providedIn: 'root' })
export class MetadataEditModalService {
  isVisible = signal(false);
  seed = signal<MetadataEditSeed | null>(null);

  private resolveFn?: (value: Record<string, any> | null) => void;

  show(seed: MetadataEditSeed): Promise<Record<string, any> | null> {
    this.seed.set(seed);
    this.isVisible.set(true);
    return new Promise<Record<string, any> | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(data: Record<string, any>): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(data);
    this.resolveFn = undefined;
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
    this.resolveFn = undefined;
  }
}
