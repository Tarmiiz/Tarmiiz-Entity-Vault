import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

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

  userInfo!: User;
  showCredentialsForm = signal(false);

  credentialsForm = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
    password2: ['', Validators.required],
  });

  ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.credentialsForm.patchValue({ username: this.userInfo?.username ?? '' });
  }

  toggleCredentialsForm() {
    if (!this.showCredentialsForm()) {
      this.credentialsForm.reset();
      this.credentialsForm.patchValue({ username: this.userInfo?.username ?? '' });
    }
    this.showCredentialsForm.update(v => !v);
  }

  async saveCredentials() {
    const { password, password2, username } = this.credentialsForm.value;

    if (password !== password2) {
      this.alertService.show('Passwords Mismatch', 'The passwords you entered do not match.');
      return;
    }

    if (!this.credentialsForm.valid) return;

    try {
      this.loadingService.show('Updating credentials...');
      await this.apiService.vaultUpdateUserCredentials(
        String(this.userInfo.userId),
        { username: username ?? '', password: password ?? '' }
      );

      this.loadingService.show('Updating profile...');
      await this.apiService.vaultUpdateUserData(String(this.userInfo.userId), {
        name: this.userInfo.name,
        email: this.userInfo.email,
        username: username ?? this.userInfo.username,
        did: this.userInfo.did,
      });

      this.userInfo.username = username ?? this.userInfo.username;
      this.authService.userInfo = this.userInfo;
      this.showCredentialsForm.set(false);
      this.alertService.show('Success', 'Your credentials have been updated.');
    } catch (error) {
      this.alertService.show('Update Failed', 'There was an error updating your credentials.');
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
