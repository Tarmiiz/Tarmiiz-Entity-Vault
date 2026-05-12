import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalAddSubscriptionService {
  isVisible = signal(false);

  private resolveFn?: (value: { subscriptionAddress: string } | null) => void;

  show(): Promise<{ subscriptionAddress: string } | null> {
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(subscriptionAddress: string): void {
    this.isVisible.set(false);
    this.resolveFn?.({ subscriptionAddress });
  }

  cancel(): void {
    this.isVisible.set(false);
    this.resolveFn?.(null);
  }
}
