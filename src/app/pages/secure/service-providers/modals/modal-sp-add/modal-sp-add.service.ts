import { Injectable, signal } from '@angular/core';

export interface AddServiceProviderResult {
  provider: string;
  spType: number;
}

@Injectable({
  providedIn: 'root'
})
export class ModalSpAddService {
  isVisible = signal(false);
  // Addresses already curated — excluded from the picker so the same SP isn't added twice.
  existing = signal<string[]>([]);

  private resolveFn?: (value: AddServiceProviderResult | null) => void;

  show(existing: string[] = []): Promise<AddServiceProviderResult | null> {
    this.existing.set((existing || []).map(a => a.toLowerCase()));
    this.isVisible.set(true);
    return new Promise<AddServiceProviderResult | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(value: AddServiceProviderResult): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(value);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
