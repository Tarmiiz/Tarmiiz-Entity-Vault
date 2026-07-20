import { Injectable, signal } from '@angular/core';

// Resolves with the picked groupId, '' to clear the membership, or null on cancel.
@Injectable({
  providedIn: 'root'
})
export class ModalUserGroupService {
  isVisible = signal(false);
  currentGroupId = signal<string>('');
  targetRole = signal<number>(0);

  private resolveFn?: (value: string | null) => void;

  show(currentGroupId: string, targetRole: number): Promise<string | null> {
    this.currentGroupId.set(currentGroupId);
    this.targetRole.set(targetRole);
    this.isVisible.set(true);

    return new Promise<string | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(groupId: string): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(groupId);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
