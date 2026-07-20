import { Injectable, signal } from '@angular/core';

// Result of the "Upload Image" modal on the asset detail Metadata tab. The image rides
// the asset document pipeline; role lands in the metadata `media` index (avatar/banner
// are public-only — the API rejects a private avatar/banner).
export interface AddAssetImageData {
  file: File;
  title: string;
  role: 'avatar' | 'banner' | 'gallery';
  documentType: number; // 1 = Public, 2 = Private (gallery only)
}

@Injectable({
  providedIn: 'root'
})
export class ModalAssetImageAddService {
  isVisible = signal(false);

  private resolveFn?: (value: AddAssetImageData | null) => void;

  show(): Promise<AddAssetImageData | null> {
    this.isVisible.set(true);
    return new Promise<AddAssetImageData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(data: AddAssetImageData): void {
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
