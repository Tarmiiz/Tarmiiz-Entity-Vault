import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalVenueCreateService {
  isVisible = signal(false);
  private resolveFn?: (value: { serviceAddress: string; settlementMode: number } | null) => void;

  show(): Promise<{ serviceAddress: string; settlementMode: number } | null> {
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(serviceAddress: string, settlementMode: number): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn({ serviceAddress, settlementMode });
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
