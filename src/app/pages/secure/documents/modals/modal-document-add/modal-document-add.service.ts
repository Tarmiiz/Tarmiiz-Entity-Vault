import { Injectable, signal } from '@angular/core';

export interface AddDocumentData {
  cid: string;
  title: string;
  description: string;
  fileType: string;
  documentType: number;
  documentState: number;
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
