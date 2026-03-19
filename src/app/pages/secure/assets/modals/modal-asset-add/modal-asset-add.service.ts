import { Injectable, signal } from '@angular/core';

export interface AddAssetData {
  owner: string;
  issuer: string;
  manager: string;
  name: string;
  symbol: string;
  description: string;
  service: string;
  currency: number;
  regulator: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalAssetAddService {
  isVisible = signal(false);

  private resolveFn?: (value: AddAssetData | null) => void;

  show(): Promise<AddAssetData | null> {
    this.isVisible.set(true);
    return new Promise<AddAssetData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(data: AddAssetData): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(data);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
