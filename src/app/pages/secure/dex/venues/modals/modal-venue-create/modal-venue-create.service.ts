import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalVenueCreateService {
  isVisible = signal(false);
  private resolveFn?: (value: { serviceAddress: string } | null) => void;

  show(): Promise<{ serviceAddress: string } | null> {
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(serviceAddress: string): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn({ serviceAddress });
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
