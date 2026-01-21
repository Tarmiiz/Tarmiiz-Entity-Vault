import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ModalUserCredentialsService, CredentialsUserData } from './modal-user-edit-credentials.service';
import { AlertService } from 'src/app/shared/components/alerts/alert/alert.service';

@Component({
  selector: 'app-modal-user-edit-credentials',
  templateUrl: './modal-user-edit-credentials.component.html',
  styleUrls: ['./modal-user-edit-credentials.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],  
})
export class ModalUserEditCredentialsComponent {
  private alertService = inject(AlertService);

  editUserCredentialsService = inject(ModalUserCredentialsService);
  private fb: FormBuilder = inject(FormBuilder);

  editForm = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
    password2: ['', Validators.required],
  });


  constructor() {
    effect(() => {
      const user = this.editUserCredentialsService.user();
      if (user) {
        this.editForm.patchValue({
          username: user.username,
          password: '',
          password2: '',
        });
      } else {
        this.editForm.reset();
      }
    });
  }

  onSave(): void {
    if (this.editForm.value.password !== this.editForm.value.password2) {
      this.alertService.show('Passwords Mismatch', 'Passwords do not match.');
      return;
    }  

    if (this.editForm.valid) {
      const formValue = this.editForm.getRawValue();
      const userData: CredentialsUserData = {
        username: formValue.username ?? '',
        password: formValue.password ?? '',
      };
      this.editUserCredentialsService.confirm(userData);
    }
  }

  onCancel(): void {
    this.editUserCredentialsService.cancel();
  }

}
