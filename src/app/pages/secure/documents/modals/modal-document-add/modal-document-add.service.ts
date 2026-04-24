import { Injectable, signal } from '@angular/core';

// The modal now always yields a File (multipart upload) — the API owns encryption + pin + add. If
// the user wants Public, the API still handles the pin.
export interface AddDocumentData {
  file: File;
  title: string;
  description: string;
  fileType: string;
  documentType: number;   // 1 = Public, 2 = Private
  documentState: number;  // 1 = Active
  sharedWith: string[];   // recipient addresses (only used when documentType = 2)
}

@Injectable({ providedIn: 'root' })
export class ModalDocumentAddService {
  isVisible = signal(false);

  private resolveFn?: (value: AddDocumentData | null) => void;

  show(): Promise<AddDocumentData | null> {
    this.isVisible.set(true);
    return new Promise<AddDocumentData | null>((resolve) => { this.resolveFn = resolve; });
  }

  confirm(data: AddDocumentData): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(data);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
