import { Injectable, signal } from '@angular/core';

/*
    "Pick one of this owner's documents" — the shared answer to any field that stores a
    per-owner `documentId`.

    It exists because such a field is otherwise UNANSWERABLE from the product: a document id
    is sequential per owner, it is minted inside the upload receipt, and the Documents tab
    renders titles and never ids. The asset's legal wrapper was a bare `<input type="number">`
    for exactly that reason, so the operator had to learn the number out of band — and, since
    the API accepted any positive integer, a typo read back as a satisfied requirement.

    Deliberately keyed by `resourceType` + `address` rather than hard-wired to assets: the
    same three-owner split (`service` | `asset` | `subscription`) already governs
    `DocumentsTabComponent`, and a second consumer should not need a second picker.
*/

export type DocumentPickerOwner = 'service' | 'asset' | 'subscription';

export interface DocumentPickerRequest {
  resourceType: DocumentPickerOwner;
  address: string;
  /** Offer "Upload new" inside the picker. False for a read-only or non-writing caller. */
  canUpload?: boolean;
  /** Pre-highlight the currently linked document, when the field already holds one. */
  selectedId?: number | null;
}

export interface DocumentPickerResult {
  documentId: number;
  title: string;
}

@Injectable({ providedIn: 'root' })
export class ModalDocumentPickerService {
  isVisible = signal(false);
  request = signal<DocumentPickerRequest | null>(null);

  private resolveFn?: (value: DocumentPickerResult | null) => void;

  show(request: DocumentPickerRequest): Promise<DocumentPickerResult | null> {
    this.request.set(request);
    this.isVisible.set(true);
    return new Promise<DocumentPickerResult | null>((resolve) => { this.resolveFn = resolve; });
  }

  confirm(data: DocumentPickerResult): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(data);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
