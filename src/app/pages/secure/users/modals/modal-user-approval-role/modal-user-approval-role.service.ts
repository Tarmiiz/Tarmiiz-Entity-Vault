import { Injectable, signal } from '@angular/core';

export type ApprovalRoleValue = 'none' | 'maker' | 'checker';

@Injectable({
  providedIn: 'root'
})
export class ModalUserApprovalRoleService {
  isVisible = signal(false);
  currentRole = signal<ApprovalRoleValue>('none');

  private resolveFn?: (value: ApprovalRoleValue | null) => void;

  show(currentRole: ApprovalRoleValue): Promise<ApprovalRoleValue | null> {
    this.currentRole.set(currentRole);
    this.isVisible.set(true);

    return new Promise<ApprovalRoleValue | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(newRole: ApprovalRoleValue): void {
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
