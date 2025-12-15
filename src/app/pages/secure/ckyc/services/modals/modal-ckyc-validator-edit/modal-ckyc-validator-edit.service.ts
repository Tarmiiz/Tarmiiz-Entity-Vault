import { Injectable, signal } from '@angular/core';
import { cKYCValidator } from '../../../../../../shared/models/data.model';

export interface EditValidatorData {
  name: string;
  email: string;
  mobile: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalcKYCValidatorEditService {
  isVisible = signal(false);
  validator = signal<cKYCValidator | null>(null);

  private resolveFn?: (value: EditValidatorData | null) => void;

  show(validator: cKYCValidator): Promise<EditValidatorData | null> {
    this.validator.set(validator);
    this.isVisible.set(true);

    return new Promise<EditValidatorData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(updatedData: EditValidatorData): void {
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
