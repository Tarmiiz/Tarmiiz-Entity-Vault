import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { ModalUserCredentialsService, CredentialsUserData } from './modal-user-edit-credentials.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';

@Component({
  selector: 'app-modal-user-edit-credentials',
  templateUrl: './modal-user-edit-credentials.component.html',
  styleUrls: ['./modal-user-edit-credentials.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalUserEditCredentialsComponent {
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);

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
      this.alertService.show(this.translate.instant('users.editCredentialsModal.passwordsMismatchTitle'), this.translate.instant('users.editCredentialsModal.passwordsMismatchMessage'));
      return;
    }

    if (this.mode === 'full') {
      const currentUsername = this.editUserCredentialsService.user()?.username ?? '';
      const newUsername = this.editForm.value.username ?? '';
      if (!newUsername) {
        this.alertService.show(this.translate.instant('users.editCredentialsModal.invalidUsernameTitle'), this.translate.instant('users.editCredentialsModal.invalidUsernameRequiredMessage'));
        return;
      }
      if (newUsername === currentUsername) {
        this.alertService.show(this.translate.instant('users.editCredentialsModal.invalidUsernameTitle'), this.translate.instant('users.editCredentialsModal.invalidUsernameSameMessage'));
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
