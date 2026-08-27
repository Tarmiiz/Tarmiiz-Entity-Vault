import { Injectable, signal } from '@angular/core';

// Attachment collected in the wizard's Documents step — uploaded AFTER the asset is
// created (docs attach to the asset address, which doesn't exist until create returns).
export interface WizardDocFile {
  file: File;
  title: string;
  description: string;
  documentType: number; // 1 = Public, 2 = Private (entity-only at creation)
}

// Images step row — same pipeline as documents plus a media role. Avatar/banner are
// public-only (they land in the asset's public metadata `media` index).
export interface WizardImageFile extends WizardDocFile {
  role: 'avatar' | 'banner' | 'gallery';
  previewUrl: string;
}

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
  // assetClass: the A1 ladder 1..11 — IMMUTABLE, and it fixes the supply model.
  // supplyMode: 1 = Fixed (initialSupply minted to contract at init), 2 = Dynamic (mint on subscribe).
  supplyMode: number;
  priceMode: number;
  // Real-world asset category (1=Precious Metals … 6=Commodities). Required for all supply modes.
  assetClass: number;
  initialSupply?: number;
  creditSettlement: boolean;
  customMetadata: Record<string, string>;
  // Security identifiers (ISIN, …) for the metadata's server-owned `identifiers` key. Empty
  // when none was typed — an ISIN is often assigned after issuance, so it is optional here
  // and the asset details page is the primary place to record it.
  identifiers: { idType: number; name: string; value: string }[];
  // Optional attachments — uploaded post-create by the list page (documents first, then images).
  documents: WizardDocFile[];
  images: WizardImageFile[];
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
