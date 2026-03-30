import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalUserRoleService } from './modal-user-role.service';

@Component({
  selector: 'app-modal-user-role',
  templateUrl: './modal-user-role.component.html',
  styleUrls: ['./modal-user-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalUserRoleComponent {

  changeRoleService = inject(ModalUserRoleService);
  private fb = inject(FormBuilder);

  readonly roles = [
    { value: 1, name: 'Admin' },
    { value: 2, name: 'Executive' },
    { value: 3, name: 'Viewer' },
  ];

  roleForm = this.fb.group({
    newRole: [null as number | null, Validators.required],
  });

  constructor() {
    effect(() => {
      const currentRole = this.changeRoleService.currentRole();
      if (currentRole !== null) {
        this.roleForm.get('newRole')?.setValue(currentRole);
      }
    });
  }

  onSave(): void {
    if (this.roleForm.valid) {
      const newRoleValue = this.roleForm.get('newRole')?.value;
      if (newRoleValue) {
        this.changeRoleService.confirm(newRoleValue);
      }
    }
  }

  onCancel(): void {
    this.changeRoleService.cancel();
  }
}
