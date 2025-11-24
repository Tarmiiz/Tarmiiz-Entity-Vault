import { Injectable, signal } from '@angular/core';
import { cKYCOperator } from '../../../models/data.model';

export interface EditOperatorData {
  name: string;
  symbol: string;
  email: string;
  mobile: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalcKYCOperatorEditService {
  isVisible = signal(false);
  operator = signal<cKYCOperator | null>(null);

  private resolveFn?: (value: EditOperatorData | null) => void;

  show(operator: cKYCOperator): Promise<EditOperatorData | null> {
    this.operator.set(operator);
    this.isVisible.set(true);

    return new Promise<EditOperatorData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(updatedData: EditOperatorData): void {
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
