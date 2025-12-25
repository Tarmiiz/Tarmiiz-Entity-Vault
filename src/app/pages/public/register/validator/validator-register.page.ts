import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, FormsModule, FormControl, FormGroup, Validators } from '@angular/forms';

import { environment } from '../../../../../environments/environment';

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingComponent } from "../../../../shared/components/alerts/loading/loading.component";
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertComponent } from "../../../../shared/components/alerts/alert/alert.component";
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';

@Component({
  selector: 'app-validator-register',
  templateUrl: './validator-register.page.html',
  styleUrls: ['./validator-register.page.scss'],
  standalone: true,
  imports: [
    IonContent, CommonModule,
    ReactiveFormsModule, FormsModule,
    RouterLink,
    AlertComponent,
    LoadingComponent
]
})
export class ValidatorRegisterPage implements OnInit {
  private fb = inject( FormBuilder);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private router = inject( Router);
  private rpcService = inject(RpcService);

  formRegister!: FormGroup;
  isLoading = false;

  constructor() { 
    this.formRegister = this.fb.group({
      name: new FormControl('', [Validators.required]),
      // symbol: new FormControl('', [Validators.required]),
      // api: new FormControl('', [Validators.required]),
      mobile: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [Validators.required]),
      password2: new FormControl('', [Validators.required]),
    });
  }

  ngOnInit() {}

  async register() {
    this.isLoading = true;
    this.loadingService.show('Registering validator ...');
    const { name, symbol, api, mobile, email, password, password2 } = this.formRegister.value;

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
      await this.rpcService.init();

      const regulatorAddress = environment.regulatorAddress;
      const countryCode = environment.countryCode;

      const validatorData = {
        email,
        mobile
      }

      this.loadingService.show('Generating zero-knowledge proof and registering...');
      const result = await this.rpcService.validatorRegister(name, email, password, JSON.stringify(validatorData));

      if (result && result.success) {
        console.log(result.contract);
        this.loadingService.hide();
        const confirmed = await this.alertService.show('Registration Successful', 'Your account has been created successfully.');
        if (confirmed) this.router.navigate(['/public/user/login']);
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
