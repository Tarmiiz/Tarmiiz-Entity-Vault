import { Injectable, signal } from '@angular/core';

import { AssetMedia } from '../../details/details.page';
import { ContactInfo } from '../../../../../shared/models/data.model';

// Everything the public asset profile modal renders — assembled by the caller from
// the asset row, its parsed metadata, and the already-loaded media blob URLs.
export interface AssetPublicViewData {
  address: string;
  name: string;
  symbol: string;
  entityName: string;
  assetTypeName: string;
  currencyCode: string;
  description: string;
  contact: ContactInfo;
  entries: [string, string][];
  media: AssetMedia | null;
  imageUrls: Record<number, string>;
}

@Injectable({
  providedIn: 'root'
})
export class ModalAssetPublicViewService {
  isVisible = signal(false);
  data = signal<AssetPublicViewData | null>(null);

  show(data: AssetPublicViewData): void {
    this.data.set(data);
    this.isVisible.set(true);
  }

  close(): void {
    this.isVisible.set(false);
  }
}
