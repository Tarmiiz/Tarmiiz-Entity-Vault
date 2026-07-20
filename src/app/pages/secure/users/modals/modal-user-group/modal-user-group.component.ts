import { Component, ChangeDetectionStrategy, inject, effect, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ReactiveFormsModule, FormBuilder } from '@angular/forms';

import { ModalUserGroupService } from './modal-user-group.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { UserGroup } from '../../../../../shared/models/data.model';

@Component({
  selector: 'app-modal-user-group',
  templateUrl: './modal-user-group.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalUserGroupComponent {

  userGroupService = inject(ModalUserGroupService);
  private apiService = inject(ApiService);
  private fb: FormBuilder = inject(FormBuilder);

  // Groups whose target role matches the user's role (groups are role-scoped).
  groups = signal<UserGroup[]>([]);

  groupForm = this.fb.group({
    groupId: [''],
  });

  constructor() {
    effect(() => {
      if (!this.userGroupService.isVisible()) return;
      this.groupForm.get('groupId')?.setValue(this.userGroupService.currentGroupId());
      this.loadGroups(this.userGroupService.targetRole());
    });
  }

  private async loadGroups(role: number) {
    try {
      const groups = await this.apiService.vaultUserGroupsList();
      this.groups.set(groups.filter(g => g.role === role));
    } catch {
      this.groups.set([]);
    }
  }

  onSave(): void {
    this.userGroupService.confirm(this.groupForm.get('groupId')?.value ?? '');
  }

  onCancel(): void {
    this.userGroupService.cancel();
  }
}
