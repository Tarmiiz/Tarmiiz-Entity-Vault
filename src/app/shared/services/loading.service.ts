import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  isVisible = signal(false);
  message = signal('Submitting data...');

  show(message?: string): void {
    if (message) {
      this.message.set(message);
    } else {
      this.message.set('Submitting data...');
    }
    this.isVisible.set(true);
  }

  hide(): void {
    this.isVisible.set(false);
  }
}
