import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, FormsModule, FormControl, FormGroup, Validators } from '@angular/forms';

import { environment } from '../../../../../environments/environment';

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';

@Component({
  selector: 'app-service-register',
  templateUrl: './service-register.page.html',
  styleUrls: ['./service-register.page.scss'],
  standalone: true,
  imports: [ 
    IonContent, CommonModule, 
    ReactiveFormsModule, FormsModule,
    RouterLink
  ]
})
export class ServiceRegisterPage implements OnInit {
  formRegister!: FormGroup;
  isLoading = false;

  private fb: FormBuilder = inject(FormBuilder);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private router = inject(Router);
  private rpcService = inject(RpcService);

  constructor() { 
    this.formRegister = this.fb.group({
      name: new FormControl('', [Validators.required]),
      website: new FormControl('', [Validators.required]),
      mobile: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      validator: new FormControl('', [Validators.required]),
      password: new FormControl('', [Validators.required]),
      password2: new FormControl('', [Validators.required]),
    });    
  }

  ngOnInit() {
  }

  async register() {
    this.isLoading = true;
    this.loadingService.show('Registering service ...');
    const { name, website, mobile, email, validator } = this.formRegister.value;
    try {
      // Initialize the RPC service
      await this.rpcService.createWallet();
      // await this.rpcService.connectCKYCContract();

      const regulatorAddress = environment.regulatorAddress;
      const countryCode = environment.countryCode;

      const serviceData = {
        website,
        email,
        mobile
      }

      // const result = await this.rpcService.cKYCServiceAdd(name, JSON.stringify(serviceData), validator);

      // if (result) {
      //   this.loadingService.hide();
      //   this.alertService.show('Registration Successful', 'Your account has been created successfully.');
      //   this.router.navigate(['/public/login']);
      // }
      // else {
      //   this.loadingService.hide();
      //   this.alertService.show('Registration Failed', 'Something went wrong. Please try again.');
      // }

    }
    catch (error) {
      this.loadingService.hide();
    }
  }  
}
