import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalDocumentShareService {
  isVisible = signal(false);

  private resolveFn?: (value: string | null) => void;

  show(): Promise<string | null> {
    this.isVisible.set(true);
    return new Promise<string | null>((resolve) => { this.resolveFn = resolve; });
  }

  confirm(account: string): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(account);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
