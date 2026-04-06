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

  private resolveFn?: (value: number | null) => void;

  show(ctx: ServiceStateContext): Promise<number | null> {
    this.context.set(ctx);
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
