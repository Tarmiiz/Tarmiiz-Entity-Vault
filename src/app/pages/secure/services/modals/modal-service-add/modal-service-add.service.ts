import { Injectable, signal } from '@angular/core';

export interface AddServiceData {
  name: string;
  description: string;
  website: string;
  email: string;
  mobile: string;
  verificationLevel: number;
  serviceType: number;
  regulator: string;
  validator: string;
  paymentProcessor: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalServiceAddService {
  isVisible = signal(false);

  private resolveFn?: (value: AddServiceData | null) => void;

  show(): Promise<AddServiceData | null> {
    this.isVisible.set(true);
    return new Promise<AddServiceData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(data: AddServiceData): void {
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
