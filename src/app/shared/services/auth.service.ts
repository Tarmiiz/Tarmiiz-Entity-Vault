import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController, AlertController } from '@ionic/angular';

import { StorageService } from './storage.service';
import { LoadingService } from '../components/alerts/loading/loading.service';
import { AlertService } from '../components/alerts/alert/alert.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private router = inject(Router);
  private storageService = inject(StorageService);


  constructor() {}

  async login() {
    // 1 hour in milliseconds
    const SESSION_DURATION = 60 * 60 * 1000;
    const expiryTime = new Date().getTime() + SESSION_DURATION;
    await this.storageService.set('sessionExpiry', expiryTime.toString());
  }

  async logout() {
    const confirmed =await this.alertService.show('Logout', 'Are you sure you want to logout?');
    if(!confirmed) return;
    this.loadingService.show('Closing session ...');
    await this.storageService.remove('sessionExpiry');
    await this.storageService.remove('contract');
    await this.storageService.remove('wallet');
    await this.storageService.remove('user');
    this.loadingService.hide();
    this.router.navigate(['/public/user/login']);

  }
}
