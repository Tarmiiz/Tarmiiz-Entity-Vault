import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ModalUserEditService, EditUserData } from './modal-user-edit.service';

@Component({
  selector: 'app-modal-user-edit',
  templateUrl: './modal-user-edit.component.html',
  styleUrls: ['./modal-user-edit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],  
})
export class ModalUserEditComponent {

  editUserService = inject(ModalUserEditService);
  private fb: FormBuilder = inject(FormBuilder);

  editForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', Validators.required],
    did: [''],
  });


  constructor() {
    effect(() => {
      const user = this.editUserService.user();
      if (user) {
        this.editForm.patchValue({
          name: user.name,
          email: user.email,
          did: user.did,
        });
      } else {
        this.editForm.reset();
      }
    });
  }

  onSave(): void {
    if (this.editForm.valid) {
      const formValue = this.editForm.getRawValue();
      const userData: EditUserData = {
        name: formValue.name ?? '',
        email: formValue.email ?? '',
        did: formValue.did ?? '',
      };
      this.editUserService.confirm(userData);
    }
  }

  onCancel(): void {
    this.editUserService.cancel();
  }

}
