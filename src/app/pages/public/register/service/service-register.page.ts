import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, FormsModule, FormControl, FormGroup, Validators } from '@angular/forms';

import { environment } from '../../../../../environments/environment';

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { AlertComponent } from "../../../../shared/components/alerts/alert/alert.component";
import { LoadingComponent } from "../../../../shared/components/alerts/loading/loading.component";

@Component({
  selector: 'app-service-register',
  templateUrl: './service-register.page.html',
  styleUrls: ['./service-register.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule, FormsModule,
    RouterLink,
    AlertComponent,
    LoadingComponent
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

  validators = signal<{ address: string; name: string; }[]>([]);

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

  async ngOnInit() {}

  async ionViewWillEnter() {
    this.isLoading = true;
    this.loadingService.show('Loading data ...');
    await this.rpcService.init();
    await this.getValidators();
    this.loadingService.hide();
  }

  async ionViewDidLeave() {
    // this.formRegister.reset();
  }

  async getValidators() {
    const result = await this.rpcService.validatorsListOwn(1, 100);
    console.log(result);
    if (result.result && result.result.validators) {
      const validators = result.result.validators
        .filter(({ state }: { state: number; }) => state === 2)
        .map(({ address, name }: { address: string; name: string; }) => ({
        address,
        name,
      }));
      console.log(validators);
      this.validators.set(validators);
    }
  }

  async register() {
    this.isLoading = true;
    this.loadingService.show('Registering service ...');
    const { name, website, mobile, email, validator, password } = this.formRegister.value;
    
    if (this.formRegister.invalid) {
      this.loadingService.hide();
      this.alertService.show('Invalid Form', 'Please fill all the required fields.');
      return;
    }
    if (this.formRegister.value.password !== this.formRegister.value.password2) {
      this.loadingService.hide();
      this.alertService.show('Passwords Mismatch', 'Passwords do not match.');
      return;
    }  

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

      this.loadingService.show('Generating zero-knowledge proof and registering...');
      const result = await this.rpcService.serviceRegister(name, email, password, JSON.stringify(serviceData), validator);

      if (result) {
        this.loadingService.hide();
        await this.alertService.show('Registration Successful', 'Your account has been created successfully.');
        this.router.navigate(['/public/user/login']);
      }
      else {
        this.loadingService.hide();
        this.alertService.show('Registration Failed', 'Something went wrong. Please try again.');
      }

    }
    catch (error) {
      this.loadingService.hide();
    }
  }  
}
