import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ModalServiceValidatorService {
  isVisible = signal(false);
  currentValidator = signal<string>('');
  verificationLevel = signal<number>(0);

  private resolveFn?: (value: string | null) => void;

  show(currentValidator: string, verificationLevel: number): Promise<string | null> {
    const zeroAddr = '0x0000000000000000000000000000000000000000';
    this.currentValidator.set(currentValidator === zeroAddr ? '' : currentValidator);
    this.verificationLevel.set(verificationLevel);
    this.isVisible.set(true);

    return new Promise<string | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(validator: string): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(validator);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
