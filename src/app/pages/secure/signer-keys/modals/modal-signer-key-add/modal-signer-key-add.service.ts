import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalSignerKeyAddService {
  isVisible = signal(false);
  private resolveFn?: (description: string | null) => void;

  show(): Promise<string | null> {
    this.isVisible.set(true);
    return new Promise<string | null>((resolve) => { this.resolveFn = resolve; });
  }
  confirm(description: string): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(description);
  }
  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
