import { Injectable, signal } from '@angular/core';

export interface NewThreadResult {
  threadId: number;
}

@Injectable({ providedIn: 'root' })
export class ModalNewThreadService {
  isVisible = signal(false);
  private resolveFn?: (value: NewThreadResult | null) => void;

  show(): Promise<NewThreadResult | null> {
    this.isVisible.set(true);
    return new Promise(resolve => { this.resolveFn = resolve; });
  }

  confirm(result: NewThreadResult) {
    this.isVisible.set(false);
    if (this.resolveFn) { this.resolveFn(result); this.resolveFn = undefined; }
  }

  cancel() {
    this.isVisible.set(false);
    if (this.resolveFn) { this.resolveFn(null); this.resolveFn = undefined; }
  }
}
