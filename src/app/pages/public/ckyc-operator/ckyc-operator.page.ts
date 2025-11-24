import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, FormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { LoadingController, AlertController } from '@ionic/angular';

import { environment } from '../../../../environments/environment';

import { RpcService } from '../../../shared/services/rpc.service';

@Component({
  selector: 'app-ckyc-operator',
  templateUrl: './ckyc-operator.page.html',
  styleUrls: ['./ckyc-operator.page.scss'],
  standalone: true,
  imports: [ 
    IonContent, CommonModule, 
    ReactiveFormsModule, FormsModule,
    RouterLink
  ]
})
export class CkycOperatorPage implements OnInit {

  formRegister!: FormGroup;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private router: Router,

    private rpcService: RpcService
  ) { 
    this.formRegister = this.fb.group({
      name: new FormControl('', [Validators.required]),
      symbol: new FormControl('', [Validators.required]),
      api: new FormControl('', [Validators.required]),
      mobile: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [Validators.required]),
      password2: new FormControl('', [Validators.required]),
    });
  }

  ngOnInit() {
  }

  async showAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }  

  async register() {

    const { name, symbol, api, mobile, email, password, password2 } = this.formRegister.value;
    this.isLoading = true;

    if (this.formRegister.invalid) {
      this.showAlert('Invalid Form', 'Please fill all the required fields.');
      return;
    }
    if (this.formRegister.value.password !== this.formRegister.value.password2) {
      this.showAlert('Passwords Mismatch', 'Passwords do not match.');
      return;
    }    

    // Show loading
    const loading = await this.loadingController.create({
      message: 'Connecting to Contract ...'
    });
    await loading.present();    

    try {

      // Initialize the RPC service
      await this.rpcService.createWallet();
      await this.rpcService.connectCKYCContract();

      const regulatorAddress = environment.regulatorAddress;
      const countryCode = environment.countryCode;

      const userData = {
        email,
        mobile
      }

      loading.message = 'Generating zero-knowledge proof and registering...';
      const result = await this.rpcService.cKYCOperatorRegister(regulatorAddress, api, name, symbol, email, password, countryCode, JSON.stringify(userData));

      if (result && result.success) {
        console.log(result.contract);
        loading.dismiss();
        this.showAlert('Registration Successful', 'Your account has been created successfully.');
        this.router.navigate(['/public/login']);
      }
      else {
        loading.dismiss();
        this.showAlert('Registration Failed', 'Something went wrong. Please try again.');
      }

    }
    catch (error) {
      loading.dismiss();
    }
  }

}
