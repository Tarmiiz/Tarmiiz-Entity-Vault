import { Component, inject, OnInit } from '@angular/core';

import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, FormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { StorageService } from '../../../../shared/services/storage.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { CryptoService } from '../../../../shared/services/crypto.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { LanguageService } from '../../../../shared/services/language.service';
import { ApiService } from '../../../../shared/services/api.service';


@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    TranslatePipe,
]
})
export class LoginPage implements OnInit {
  private alertService = inject(AlertService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private storageService = inject(StorageService);
  private cryptoService = inject(CryptoService);
  private authService = inject(AuthService);
  private languageService = inject(LanguageService);
  private translate = inject(TranslateService);
  apiService = inject(ApiService);

  formLogin!: FormGroup;
  isLoading = false;

  get lang() { return this.languageService.lang(); }
  toggleLang() { this.languageService.toggle(); }

  // Fall back to the static brand logo when the tenant has no avatar (endpoint 404s).
  onLogoError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (img && !img.src.endsWith('assets/images/logo.svg')) img.src = 'assets/images/logo.svg';
  }

  constructor(
  ) { 
    this.formLogin = this.fb.group({
      email: new FormControl('', [Validators.required]),
      password: new FormControl('', [Validators.required]),
    });
  }

  async ngOnInit() {
    await this.storageService.remove('sessionExpiry');
    await this.storageService.remove('contract');
    await this.storageService.remove('wallet');
    await this.storageService.remove('user');
  }

 async login() {
    if (!this.formLogin.valid) {
      await this.alertService.show(this.translate.instant('login.errors.invalidFormTitle'), this.translate.instant('login.errors.invalidFormMessage'));
      return;
    }

    const { email, password } = this.formLogin.value;

    this.isLoading = true;

    try {

      // Attempt login with 1 hour session duration
      const loginResult = await this.authService.login(email, password);
      if (loginResult.success) {
          // route to authorized pages — spinner stays up until the dashboard hides it
          await this.router.navigate(['/authorized']);
      }
      else {
        console.error('Login failed:', loginResult.error);
        let errorMessage = this.translate.instant('login.errors.unexpectedDuringLogin');
        const errStr = String(loginResult.error ?? '');
        // AuthService already routed to the claim wizard — no alert to show.
        if (errStr === 'CLAIM_REQUIRED') return;
        if (errStr) {
          if (errStr === 'ENTITY_PENDING' || errStr.includes('pending regulator approval')) {
            errorMessage = this.translate.instant('login.errors.entityPending');
          } else if (errStr === 'ENTITY_INACTIVE' || errStr.includes('Sign-in is disabled')) {
            errorMessage = this.translate.instant('login.errors.entityInactive');
          } else if (errStr === 'ENTITY_UNKNOWN') {
            errorMessage = this.translate.instant('login.errors.entityUnknown');
          } else if (errStr.includes('User not found')) {
            errorMessage = this.translate.instant('login.errors.userNotFound');
          } else if (errStr.includes('proof')) {
            errorMessage = this.translate.instant('login.errors.proofFailed');
          } else if (errStr.includes('network')) {
            errorMessage = this.translate.instant('login.errors.networkError');
          } else if (errStr.includes('Error: Assert Failed')) {
            errorMessage = this.translate.instant('login.errors.credentialsInvalid');
          } else if (errStr.includes('Error: execution reverted')) {
            errorMessage = this.translate.instant('login.errors.credentialsInvalid');
          } else {
            errorMessage = this.translate.instant('login.errors.credentialsInvalid');
          }
        }
        await this.alertService.show(this.translate.instant('login.errors.loginFailedTitle'), errorMessage);
      }

    }
    catch (error: any) {
      let errorMessage = this.translate.instant('login.errors.unexpectedDuringLogin');
      if (error.message) {
        if (error.message.includes('User not found')) {
          errorMessage = this.translate.instant('login.errors.userNotFound');
        } else if (error.message.includes('proof')) {
          errorMessage = this.translate.instant('login.errors.proofFailed');
        } else if (error.message.includes('network')) {
          errorMessage = this.translate.instant('login.errors.networkError');
        } else if (error.message.includes('Error: Assert Failed')) {
          errorMessage = this.translate.instant('login.errors.credentialsInvalid');
        } else if (error.message.includes('Error: execution reverted')) {
          errorMessage = this.translate.instant('login.errors.credentialsInvalid');
        } else {
          errorMessage = error.message;
        }
      }

      await this.alertService.show(this.translate.instant('login.errors.loginErrorTitle'), errorMessage);
    }
    finally {
      this.isLoading = false;
    }
  }

}
