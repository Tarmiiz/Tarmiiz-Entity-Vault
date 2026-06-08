import { Injectable, signal } from '@angular/core';

export interface MetadataEditSeed {
  /** Modal heading, e.g. "Edit Asset Metadata". */
  title: string;
  /** Current description (the reserved `description` key). */
  description: string;
  /** Current custom key/value pairs (everything except `description`). */
  entries: [string, string][];
}

/**
 * Shared free-form metadata editor (description + arbitrary key/value rows).
 * Returns the assembled metadata object `{ description, ...customKV }`, or null on cancel.
 * Used by both the asset and service detail pages.
 */
@Injectable({ providedIn: 'root' })
export class MetadataEditModalService {
  isVisible = signal(false);
  seed = signal<MetadataEditSeed | null>(null);

  private resolveFn?: (value: Record<string, string> | null) => void;

  show(seed: MetadataEditSeed): Promise<Record<string, string> | null> {
    this.seed.set(seed);
    this.isVisible.set(true);
    return new Promise<Record<string, string> | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(data: Record<string, string>): void {
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
