import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalUserApprovalRoleService, ApprovalRoleValue } from './modal-user-approval-role.service';

@Component({
  selector: 'app-modal-user-approval-role',
  templateUrl: './modal-user-approval-role.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalUserApprovalRoleComponent {

  approvalRoleService = inject(ModalUserApprovalRoleService);
  private fb: FormBuilder = inject(FormBuilder);

  roleForm = this.fb.group({
    newRole: ['none' as ApprovalRoleValue, Validators.required],
  });

  constructor() {
    effect(() => {
      const currentRole = this.approvalRoleService.currentRole();
      this.roleForm.get('newRole')?.setValue(currentRole);
    });
  }

  onSave(): void {
    if (this.roleForm.valid) {
      const newRoleValue = this.roleForm.get('newRole')?.value as ApprovalRoleValue | null;
      if (newRoleValue) this.approvalRoleService.confirm(newRoleValue);
    }
  }

  onCancel(): void {
    this.approvalRoleService.cancel();
  }
}
