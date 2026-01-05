import { Injectable, signal } from '@angular/core';

export interface AddValidatorData {
  name: string;
  email: string;
  mobile: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalValidatorAddService {
  isVisible = signal(false);

  private resolveFn?: (value: AddValidatorData | null) => void;

  show(): Promise<AddValidatorData | null> {
    this.isVisible.set(true);

    return new Promise<AddValidatorData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(newData: AddValidatorData): void {
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
