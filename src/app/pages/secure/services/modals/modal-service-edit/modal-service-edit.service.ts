import { Injectable, signal } from '@angular/core';
import { Service } from '../../../../../shared/models/data.model';

export interface EditServiceData {
  name: string;
  website: string;
  email: string;
  mobile: string;
  validator: string;
  paymentProcessor: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalServiceEditService {
  isVisible = signal(false);
  service = signal<Service | null>(null);

  private resolveFn?: (value: EditServiceData | null) => void;

  show(service: Service): Promise<EditServiceData | null> {
    this.service.set(service);
    this.isVisible.set(true);

    return new Promise<EditServiceData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(updatedData: EditServiceData): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(updatedData);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }  
}
