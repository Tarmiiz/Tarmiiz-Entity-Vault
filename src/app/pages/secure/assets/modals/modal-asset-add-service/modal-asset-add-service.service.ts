import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ModalAssetAddServiceService {
  isVisible = signal(false);
  currentServices = signal<string[]>([]);

  private resolveFn?: (value: string | null) => void;

  show(currentServiceAddresses: string[]): Promise<string | null> {
    this.currentServices.set(currentServiceAddresses);
    this.isVisible.set(true);

    return new Promise<string | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(serviceAddress: string): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(serviceAddress);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
