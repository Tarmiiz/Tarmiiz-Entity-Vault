import { Injectable, signal } from '@angular/core';

export interface ServiceStateContext {
  serviceAddress: string;
  serviceName: string;
  currentState: number;
}

@Injectable({
  providedIn: 'root'
})
export class ModalAssetServiceStateService {
  isVisible = signal(false);
  context = signal<ServiceStateContext | null>(null);

  private resolveFn?: (value: {state: number, reason: string} | null) => void;

  show(ctx: ServiceStateContext): Promise<{state: number, reason: string} | null> {
    this.context.set(ctx);
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
