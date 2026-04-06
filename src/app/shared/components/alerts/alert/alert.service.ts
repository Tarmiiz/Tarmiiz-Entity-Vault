import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AlertService {
  isVisible = signal(false);
  title = signal('');
  message = signal('');
  confirmText = signal('OK');
  maxWidth = signal('max-w-md');

  private resolveFn?: (value: boolean) => void;

  show(title: string, message: string, confirmText = 'OK', maxWidth = 'max-w-md'): Promise<boolean> {
    this.title.set(title);
    this.message.set(message);
    this.confirmText.set(confirmText);
    this.maxWidth.set(maxWidth);
    this.isVisible.set(true);

    return new Promise<boolean>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(true);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(false);
    }
  }
}
