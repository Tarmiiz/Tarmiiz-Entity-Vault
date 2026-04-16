import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  isVisible = signal(false);
  message = signal('Submitting data...');
  progress = signal<number | null>(null);

  show(message?: string): void {
    this.message.set(message || 'Submitting data...');
    this.progress.set(null);
    this.isVisible.set(true);
  }

  setProgress(percent: number | null): void {
    this.progress.set(percent);
  }

  setMessage(message: string): void {
    this.message.set(message);
  }

  hide(): void {
    this.isVisible.set(false);
    this.progress.set(null);
  }
}
