import { Component, ChangeDetectionStrategy, inject } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalUserAddService, AddUserData } from './modal-user-add.service';

import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';

@Component({
  selector: 'app-modal-user-add',
  templateUrl: './modal-user-add.component.html',
  styleUrls: ['./modal-user-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
})
export class ModalUserAddComponent {

  addUserService = inject(ModalUserAddService);
  private fb: FormBuilder = inject(FormBuilder);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);

  isLoading = false;

  addForm = this.fb.group({
    name:         ['', Validators.required],
    email:        ['', [Validators.required, Validators.email]],
    did:          [''],
    username:     ['', Validators.required],
    password:     ['', Validators.required],
    password2:    ['', Validators.required],
    role:         ['', Validators.required],
    approvalRole: ['none'],
  });

  readonly roles = [
    { variableId: 1, name: 'Admin' },
    { variableId: 2, name: 'Executive' },
    { variableId: 3, name: 'Viewer' },
  ];

  constructor() {
    this.addForm.get('role')?.valueChanges.subscribe((role) => {
      if (Number(role) !== 2) this.addForm.get('approvalRole')?.setValue('none');
    });
  }

  isExecutive(): boolean {
    return Number(this.addForm.get('role')?.value) === 2;
  }


  onSave(): void {
    this.isLoading = true;
    this.loadingService.show('Registering user...');

    if (this.addForm.invalid) {
      this.loadingService.hide();
      this.alertService.show('Invalid Form', 'Please fill all the required fields.');
      return;
    }

    if (this.addForm.value.password !== this.addForm.value.password2) {
      this.loadingService.hide();
      this.alertService.show('Passwords Mismatch', 'Passwords do not match.');
      return;
    }

    try {
      const formValue = this.addForm.getRawValue();
      const approvalRole = (Number(formValue.role) === 2 ? (formValue.approvalRole || 'none') : 'none') as 'none' | 'maker' | 'checker';
      const addData: AddUserData = {
        name: formValue.name ?? '',
        email: formValue.email ?? '',
        did: formValue.did ?? '',
        role: formValue.role ?? '',
        username: formValue.username ?? '',
        password: formValue.password ?? '',
        approvalRole,
      };
      this.loadingService.hide();
      this.addUserService.confirm(addData);
    }
    catch (error) {
      this.loadingService.hide();
      this.alertService.show('Error', 'An error occurred while registering the service.');
    }

  }

  onCancel(): void {
    this.addUserService.cancel();
  }

}
