import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ModalServiceValidatorService {
  isVisible = signal(false);
  currentValidator = signal<string>('');
  verificationLevel = signal<number>(0);
  // Addresses already attached to the service — hidden from the picker (attaching one
  // again is a no-op on-chain, so offering it can only mislead).
  excluded = signal<string[]>([]);

  private resolveFn?: (value: string | null) => void;

  show(currentValidator: string, verificationLevel: number, exclude: string[] = []): Promise<string | null> {
    const zeroAddr = '0x0000000000000000000000000000000000000000';
    this.currentValidator.set(currentValidator === zeroAddr ? '' : currentValidator);
    this.verificationLevel.set(verificationLevel);
    this.excluded.set(exclude.map(a => a.toLowerCase()));
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
