import { Component, ChangeDetectionStrategy, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalUserAddService, AddUserData } from './modal-user-add.service';

import { ApiService } from '../../../../../shared/services/api.service';
import { LoadingService } from 'src/app/shared/components/alerts/loading/loading.service';
import { AlertService } from 'src/app/shared/components/alerts/alert/alert.service';

@Component({
  selector: 'app-modal-user-add',
  templateUrl: './modal-user-add.component.html',
  styleUrls: ['./modal-user-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],  
})
export class ModalUserAddComponent {

  addUserService = inject(ModalUserAddService);
  private apiService = inject(ApiService);
  private fb: FormBuilder = inject(FormBuilder);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);

  isLoading = false;

  addForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    did: [''],
    username: ['', Validators.required],
    password: ['', Validators.required],
    password2: ['', Validators.required],
    role: ['', Validators.required],
  });

  roles = signal<{ variableId: number; name: string; }[]>([]);


  constructor() {
    this.loadRoles();
  }

  async loadRoles() {
    const data = await this.apiService.vaultGetGlobalVariablesByCategory('User Role');
    if (data) {
      this.roles.set(data.map((item: any) => ({ variableId: item.variable_id, name: item.name })));
    }
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
      const addData: AddUserData = {
        name: formValue.name ?? '',
        email: formValue.email ?? '',
        did: formValue.did ?? '',
        role: formValue.role ?? '',
        username: formValue.username ?? '',
        password: formValue.password ?? '',
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
