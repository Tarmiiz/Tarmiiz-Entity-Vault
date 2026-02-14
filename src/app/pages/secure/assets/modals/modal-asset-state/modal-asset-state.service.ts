import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ModalAssetStateService {
  isVisible = signal(false);
  currentState = signal<number | null>(null);

  private resolveFn?: (value: number | null) => void;

  show(currentState: number): Promise<number | null> {
    this.currentState.set(currentState);
    this.isVisible.set(true);

    return new Promise<number | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(newState: number): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(newState);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }  
}
