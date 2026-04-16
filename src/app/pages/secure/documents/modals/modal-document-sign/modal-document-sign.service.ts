import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalDocumentSignService {
  isVisible = signal(false);
  private resolveFn?: (keyId: number | null) => void;

  show(): Promise<number | null> {
    this.isVisible.set(true);
    return new Promise<number | null>((resolve) => { this.resolveFn = resolve; });
  }
  confirm(keyId: number): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(keyId);
  }
  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
