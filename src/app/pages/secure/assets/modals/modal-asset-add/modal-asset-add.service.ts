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
  // tokenType: leaf-template kind (V1: 1 = T20; T3643 follow-up adds 2).
  tokenType: number;
  // supplyMode: 1 = Fixed (initialSupply minted to contract at init), 2 = Dynamic (mint on subscribe).
  supplyMode: number;
  priceMode: number;
  // Real-world asset category (1=Precious Metals … 6=Commodities). Required for all supply modes.
  assetType: number;
  initialSupply?: number;
  creditSettlement: boolean;
  customMetadata: Record<string, string>;
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
