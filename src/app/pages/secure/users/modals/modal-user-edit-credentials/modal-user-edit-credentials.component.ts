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

  mode: 'password' | 'full' = 'password';

  editForm = this.fb.group({
    username: [''],
    password: ['', Validators.required],
    password2: ['', Validators.required],
  });

  constructor() {
    effect(() => {
      const user = this.editUserCredentialsService.user();
      if (user) {
        this.mode = 'password';
        this.editForm.patchValue({ username: '', password: '', password2: '' });
      } else {
        this.editForm.reset();
      }
    });
  }

  setMode(mode: 'password' | 'full'): void {
    this.mode = mode;
    this.editForm.patchValue({ username: '', password: '', password2: '' });
  }

  onSave(): void {
    if (this.editForm.value.password !== this.editForm.value.password2) {
      this.alertService.show('Passwords Mismatch', 'Passwords do not match.');
      return;
    }

    if (this.mode === 'full') {
      const currentUsername = this.editUserCredentialsService.user()?.username ?? '';
      const newUsername = this.editForm.value.username ?? '';
      if (!newUsername) {
        this.alertService.show('Invalid Username', 'Please enter a new username.');
        return;
      }
      if (newUsername === currentUsername) {
        this.alertService.show('Invalid Username', 'The new username must be different from the current one.');
        return;
      }
    }

    const formValue = this.editForm.getRawValue();
    this.editUserCredentialsService.confirm({
      username: this.mode === 'full' ? (formValue.username ?? '') : null,
      password: formValue.password ?? '',
    });
  }

  onCancel(): void {
    this.editUserCredentialsService.cancel();
  }

}
