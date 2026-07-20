import { Injectable, signal } from '@angular/core';

// Result of the shared "Upload Image" modal (service detail Images section + admin profile
// Images tab). The image rides the owner's document pipeline; the role lands in that owner's
// metadata `media` index (avatar/banner are public-only — the API rejects a private one).
export interface AddImageData {
  file: File;
  title: string;
  role: 'avatar' | 'banner' | 'gallery';
  documentType: number; // 1 = Public, 2 = Private (gallery only)
}

@Injectable({ providedIn: 'root' })
export class ModalImageAddService {
  isVisible = signal(false);

  private resolveFn?: (value: AddImageData | null) => void;

  show(): Promise<AddImageData | null> {
    this.isVisible.set(true);
    return new Promise<AddImageData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(data: AddImageData): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(data);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
