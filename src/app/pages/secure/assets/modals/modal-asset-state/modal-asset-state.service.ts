import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ModalAssetStateService {
  isVisible = signal(false);
  currentState = signal<number | null>(null);

  private resolveFn?: (value: {state: number, reason: string} | null) => void;

  show(currentState: number): Promise<{state: number, reason: string} | null> {
    this.currentState.set(currentState);
    this.isVisible.set(true);

    return new Promise<{state: number, reason: string} | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(newState: number, reason: string): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn({state: newState, reason});
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }  
}
