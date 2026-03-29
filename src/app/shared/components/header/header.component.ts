import { Component, Input, OnInit, inject } from '@angular/core';
import {
  IonHeader, IonTitle, IonToolbar, IonButtons, IonMenuButton, IonButton, IonLabel } from '@ionic/angular/standalone';
import { AuthService } from '../../services/auth.service';
import { MenuController } from '@ionic/angular/standalone';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  imports: [IonLabel,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonMenuButton, IonButton
  ]
})
export class HeaderComponent  implements OnInit {
  @Input() title!: string;
  @Input() userInfo: any;
  private authService = inject(AuthService);
  private menuController = inject(MenuController);

  constructor() {}

  ngOnInit() {}

  async logout() {
    await this.authService.logout();
    await this.menuController.close();
  }


}
