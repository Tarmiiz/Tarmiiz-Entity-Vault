import { Component, ChangeDetectionStrategy, inject } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ModalGroupAddService, AddGroupData } from './modal-group-add.service';

@Component({
  selector: 'app-modal-group-add',
  templateUrl: './modal-group-add.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalGroupAddComponent {

  addGroupService = inject(ModalGroupAddService);
  private fb: FormBuilder = inject(FormBuilder);
  private translate = inject(TranslateService);

  addForm = this.fb.group({
    name:        ['', Validators.required],
    description: [''],
    role:        ['', Validators.required],
  });

  // Entity-side groups target executives + viewers only (admins bypass menu gating;
  // role 4 is folded pre-chokepoint). The role is IMMUTABLE after create.
  readonly roles = [
    { variableId: 2, name: this.translate.instant('users.roles.executive') },
    { variableId: 3, name: this.translate.instant('role.viewer') },
  ];

  onSave(): void {
    if (this.addForm.invalid) return;
    const v = this.addForm.getRawValue();
    const data: AddGroupData = {
      name: (v.name ?? '').trim(),
      description: (v.description ?? '').trim(),
      role: Number(v.role),
    };
    this.addForm.reset({ name: '', description: '', role: '' });
    this.addGroupService.confirm(data);
  }

  onCancel(): void {
    this.addForm.reset({ name: '', description: '', role: '' });
    this.addGroupService.cancel();
  }
}
