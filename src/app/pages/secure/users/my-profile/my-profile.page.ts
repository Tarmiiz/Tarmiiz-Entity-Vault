import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';

import { AuthService } from '../../../../shared/services/auth.service';
import { ApiService } from '../../../../shared/services/api.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';

import { User } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-my-profile',
  templateUrl: './my-profile.page.html',
  styleUrls: ['./my-profile.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HeaderComponent, TranslatePipe,
  ]
})
export class MyProfilePage {
  private authService = inject(AuthService);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private fb = inject(FormBuilder);
  private translate = inject(TranslateService);

  userInfo!: User;
  showCredentialsForm = signal(false);

  handle = signal<string | null>(null);
  handleFull = signal<string | null>(null);

  credentialsForm = this.fb.group({
    currentPassword: ['', Validators.required],
    password: ['', Validators.required],
    password2: ['', Validators.required],
  });

  ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.loadHandle();
  }

  async loadHandle() {
    try {
      const res = await this.apiService.vaultUserHandleGet(this.userInfo.userId);
      this.handle.set(res?.handle || null);
      this.handleFull.set(res?.fullAddress || null);
    } catch {
      this.handle.set(null);
      this.handleFull.set(null);
    }
  }

  toggleCredentialsForm() {
    if (!this.showCredentialsForm()) {
      this.credentialsForm.reset();
    }
    this.showCredentialsForm.update(v => !v);
  }

  async saveCredentials() {
    const { currentPassword, password, password2 } = this.credentialsForm.value;

    if (password !== password2) {
      this.alertService.info(this.translate.instant('users.myProfile.passwordsMismatchTitle'), this.translate.instant('users.myProfile.passwordsMismatchMsg'));
      return;
    }

    if (!this.credentialsForm.valid) return;

    try {
      this.loadingService.show(this.translate.instant('users.myProfile.updatingPassword'));
      // The API verifies the current password, then rotates the commitment (password-only).
      const res: any = await this.apiService.vaultUserSelfCredentials(String(this.userInfo.userId), {
        currentPassword: currentPassword ?? '',
        password: password ?? '',
      });

      // ApiService returns { error } rather than throwing (e.g. wrong current password).
      if (res?.error) {
        this.alertService.info(this.translate.instant('users.myProfile.updateFailedTitle'), res.error);
        return;
      }

      this.showCredentialsForm.set(false);
      this.alertService.info(this.translate.instant('alerts.success'), this.translate.instant('users.myProfile.passwordUpdatedMsg'));
    } catch (error) {
      this.alertService.info(this.translate.instant('users.myProfile.updateFailedTitle'), this.translate.instant('users.myProfile.updateFailedMsg'));
    } finally {
      this.loadingService.hide();
    }
  }

  getStateClass(state: number): string {
    switch (state) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
}
