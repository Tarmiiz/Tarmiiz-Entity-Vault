import { Injectable, signal } from '@angular/core';

export interface AddServiceData {
  name: string;
  email: string;
  mobile: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalcKYCServiceAddService {
  isVisible = signal(false);

  private resolveFn?: (value: AddServiceData | null) => void;

  show(): Promise<AddServiceData | null> {
    this.isVisible.set(true);

    return new Promise<AddServiceData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(newData: AddServiceData): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(newData);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }   
}
