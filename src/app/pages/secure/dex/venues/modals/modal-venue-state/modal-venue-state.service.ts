import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalVenueStateService {
  isVisible = signal(false);
  currentState = signal<number>(1);

  private resolveFn?: (value: { newState: number } | null) => void;

  show(currentState: number): Promise<{ newState: number } | null> {
    this.currentState.set(currentState);
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(newState: number): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn({ newState });
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
