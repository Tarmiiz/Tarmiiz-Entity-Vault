import { Injectable, signal } from '@angular/core';

export interface EditOperatorData {
  address: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalProfileOperatorEditService {
  isVisible = signal(false);
  title = signal<string | null>(null);
  operator = signal<string | null>(null);

  private resolveFn?: (value: EditOperatorData | null) => void;

  show(title: string, operator: string): Promise<EditOperatorData | null> {
    this.title.set(title);
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
