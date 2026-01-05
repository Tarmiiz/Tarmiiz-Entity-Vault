import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, FormsModule, FormControl, FormGroup, Validators } from '@angular/forms';

import { RpcService } from '../../../../shared/services/rpc.service';
import { StorageService } from '../../../../shared/services/storage.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { AlertComponent } from "../../../../shared/components/alerts/alert/alert.component";
import { LoadingComponent } from "../../../../shared/components/alerts/loading/loading.component";
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule, FormsModule,
    RouterLink,
    AlertComponent,
    LoadingComponent
]
})
export class LoginPage implements OnInit {
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private storageService = inject(StorageService);
  private rpcService = inject(RpcService);

  formLogin!: FormGroup;
  isLoading = false;

  contractAddress = environment.regulatorAddress;

  constructor(
  ) { 
    this.formLogin = this.fb.group({
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [Validators.required]),
      // contract: new FormControl(this.contractAddress, [Validators.required])
    });
  }

  async ngOnInit() {
    await this.storageService.remove('sessionExpiry');
    await this.storageService.remove('contract');
    await this.storageService.remove('wallet');
  }

  async showAlert(header: string, message: string) {
      this.alertService.show(header, message);
  }

 async login() {
    if (!this.formLogin.valid) {
      await this.alertService.show('Invalid Form', 'Please enter a valid email and password.');
      return;
    }

    const { email, password } = this.formLogin.value;

    this.isLoading = true;

    // Show loading
    this.loadingService.show('Connecting to Contract ...');
    try {

      // set regulatro contract address
      this.rpcService.regulatorContractAddress = this.contractAddress;

      // Initialize the RPC service
      await this.rpcService.init();

      this.loadingService.show('Generating zero-knowledge proof and logging in...');


      // Attempt login with 1 hour session duration
      const loginResult = await this.rpcService.login(email, password, 3600);
      
      this.loadingService.hide();
      this.isLoading = false;

      if (loginResult.success) {
        // save contract to storage
        this.storageService.set('contract', this.contractAddress);
        // get regulator info
        await this.rpcService.regulatorInfoGet();
        // route to authorized pages
        this.router.navigate(['/authorized']);
      } else {
        console.error('Login failed:', loginResult.error);
        await this.showAlert('Login Failed', loginResult.error || 'Unknown error occurred');
      }

    } 
    catch (error: any) {
      this.loadingService.hide();
      this.isLoading = false;
      
      console.error('Login error:', error);
      
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
        } else {
          errorMessage = error.message;
        }
      }
      
      await this.showAlert('Login Error', errorMessage);
    }
  }

}
