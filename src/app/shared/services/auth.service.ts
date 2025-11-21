import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController, AlertController } from '@ionic/angular';

import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  constructor(
    private router: Router,
    private loadingController: LoadingController,
    private alertController: AlertController,

    private storageService: StorageService,
  ) {
  }

  async login() {
    // 1 hour in milliseconds
    const SESSION_DURATION = 60 * 60 * 1000;
    const expiryTime = new Date().getTime() + SESSION_DURATION;
    await this.storageService.set('sessionExpiry', expiryTime.toString());
  }

  async logout() {
    const alert = await this.alertController.create({
      header: 'Logout',
      message: 'Are you sure you want to logout?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Logout',
          handler: async () => {
            alert.dismiss();
            const loading = await this.loadingController.create({
              message: 'Logging out...'
            });
            await loading.present();
        
            await this.storageService.remove('sessionExpiry');
            await this.storageService.remove('contract');
            await this.storageService.remove('wallet');
            loading.dismiss();
            this.router.navigate(['/login']);
          }
        }
      ]
    });
    await alert.present();



  }
}
