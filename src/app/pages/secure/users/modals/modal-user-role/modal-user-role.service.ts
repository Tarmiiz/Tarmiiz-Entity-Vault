import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ModalUserRoleService {
  isVisible = signal(false);
  currentRole = signal<number | null>(null);

  private resolveFn?: (value: number | null) => void;

  show(currentRole: number): Promise<number | null> {
    this.currentRole.set(currentRole);
    this.isVisible.set(true);

    return new Promise<number | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(newRole: number): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(newRole);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
