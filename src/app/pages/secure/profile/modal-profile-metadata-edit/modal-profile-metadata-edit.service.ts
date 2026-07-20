import { Injectable, signal } from '@angular/core';

export interface EntityMetadata {
  description: string;
  contact: {
    email: string;
    phone: string;
    website: string;
    address: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ModalProfileMetadataEditService {
  isVisible = signal(false);
  metadata = signal<EntityMetadata | null>(null);

  private resolveFn?: (value: EntityMetadata | null) => void;

  show(metadata: EntityMetadata): Promise<EntityMetadata | null> {
    this.metadata.set(metadata);
    this.isVisible.set(true);
    return new Promise<EntityMetadata | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(data: EntityMetadata): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(data);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
