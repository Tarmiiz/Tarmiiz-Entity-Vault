import { Component, Input, OnInit, inject } from '@angular/core';
import {
  IonHeader, IonTitle, IonToolbar, IonButtons, IonMenuButton, IonButton, IonLabel } from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MenuController } from '@ionic/angular/standalone';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  imports: [IonLabel,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonMenuButton, IonButton, RouterLink
  ]
})
export class HeaderComponent  implements OnInit {
  @Input() title!: string;
  private authService = inject(AuthService);

  get userInfo() {
    return this.authService.userInfo;
  }
  private menuController = inject(MenuController);

  get profileRoute(): string {
    const user = this.authService.userInfo;
    return user?.role === 1
      ? '/authorized/users/details/' + user.userId
      : '/authorized/users/my-profile';
  }

  constructor() {}

  ngOnInit() {}

  async logout() {
    await this.authService.logout();
    await this.menuController.close();
  }


}
