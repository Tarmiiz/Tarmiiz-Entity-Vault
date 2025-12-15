import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, FormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { LoadingController, AlertController } from '@ionic/angular';

import { RpcService } from '../../../../shared/services/rpc.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { StorageService } from '../../../../shared/services/storage.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [ 
    IonContent, CommonModule, 
    ReactiveFormsModule, FormsModule,
    RouterLink
  ]
})
export class LoginPage implements OnInit {

  formLogin!: FormGroup;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private router: Router,

    private storageService: StorageService,
    private authService: AuthService,
    private rpcService: RpcService
  ) { 
    this.formLogin = this.fb.group({
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [Validators.required]),
      contract: new FormControl('', [Validators.required])
    });
  }

  async ngOnInit() {
    await this.storageService.remove('sessionExpiry');
    await this.storageService.remove('contract');
    await this.storageService.remove('wallet');
  }

  async showAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK']
    });
    await alert.present();
  }

 async login() {
    if (!this.formLogin.valid) {
      await this.showAlert('Invalid Form', 'Please enter a valid email and password.');
      return;
    }

    const { email, password, contract } = this.formLogin.value;

    this.isLoading = true;

    // Show loading
    const loading = await this.loadingController.create({
      message: 'Connecting to Contract ...'
    });
    await loading.present();

    try {

      // set regulatro contract address
      this.rpcService.regulatorContractAddress = contract;

      // Initialize the RPC service
      await this.rpcService.init();

      loading.message = 'Generating zero-knowledge proof and logging in...';


      // Attempt login with 1 hour session duration
      const loginResult = await this.rpcService.login(email, password, 3600);
      
      await loading.dismiss();
      this.isLoading = false;

      if (loginResult.success) {
        // save contract to storage
        this.storageService.set('contract', contract);
        // get regulator info
        await this.rpcService.info();
        // route to authorized pages
        this.router.navigate(['/authorized']);
      } else {
        console.error('Login failed:', loginResult.error);
        await this.showAlert('Login Failed', loginResult.error || 'Unknown error occurred');
      }

    } 
    catch (error: any) {
      await loading.dismiss();
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
