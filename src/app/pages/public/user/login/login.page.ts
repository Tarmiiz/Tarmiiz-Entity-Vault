import { Component, inject, OnInit } from '@angular/core';

import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, FormsModule, FormControl, FormGroup, Validators } from '@angular/forms';

import { StorageService } from '../../../../shared/services/storage.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { CryptoService } from '../../../../shared/services/crypto.service';
import { AuthService } from '../../../../shared/services/auth.service';


@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
]
})
export class LoginPage implements OnInit {
  private alertService = inject(AlertService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private storageService = inject(StorageService);
  private cryptoService = inject(CryptoService);
  private authService = inject(AuthService);  

  formLogin!: FormGroup;
  isLoading = false;

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
      await this.alertService.show('Invalid Form', 'Please enter a valid email and password.');
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
        let errorMessage = 'An unexpected error occurred during login.';
        const errStr = String(loginResult.error ?? '');
        if (errStr) {
          if (errStr.includes('User not found')) {
            errorMessage = 'User not found. Please check your credentials or register first.';
          } else if (errStr.includes('proof')) {
            errorMessage = 'Failed to generate authentication proof. Please try again.';
          } else if (errStr.includes('network')) {
            errorMessage = 'Network error. Please check your internet connection.';
          } else if (errStr.includes('Error: Assert Failed')) {
            errorMessage = 'Login Failed. Please check your credentials.';
          } else if (errStr.includes('Error: execution reverted')) {
            errorMessage = 'Login Failed. Please check your credentials.';
          } else {
            errorMessage = 'Login Failed. Please check your credentials.';
          }
        }
        await this.alertService.show('Login Failed', errorMessage);
      }

    } 
    catch (error: any) {
      let errorMessage = 'An unexpected error occurred during login.';
      if (error.message) {
        if (error.message.includes('User not found')) {
          errorMessage = 'User not found. Please check your credentials or register first.';
        } else if (error.message.includes('proof')) {
          errorMessage = 'Failed to generate authentication proof. Please try again.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (error.message.includes('Error: Assert Failed')) {
          errorMessage = 'Login Failed. Please check your credentials.';
        } else if (error.message.includes('Error: execution reverted')) {
          errorMessage = 'Login Failed. Please check your credentials.';
        } else {
          errorMessage = error.message;
        }
      }
      
      await this.alertService.show('Login Error', errorMessage);
    }
    finally {
      this.isLoading = false;
    }
  }

}
