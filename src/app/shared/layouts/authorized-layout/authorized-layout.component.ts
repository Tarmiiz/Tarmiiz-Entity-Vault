import { Component, inject } from '@angular/core';
import {
  IonRouterOutlet, IonSplitPane, IonMenu, IonHeader, IonToolbar,
  IonContent, IonList, IonItem, IonLabel,
  IonButtons, IonMenuButton, MenuController } from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { Entity, User } from '../../models/data.model';
import { AlertComponent } from '../../components/alerts/alert/alert.component';
import { LoadingComponent } from "../../components/alerts/loading/loading.component";
import { ModalNewThreadComponent } from "../../../pages/secure/messages/modals/modal-new-thread/modal-new-thread.component";

@Component({
  selector: 'app-authorized-layout',
  templateUrl: './authorized-layout.component.html',
  styleUrls: ['./authorized-layout.component.scss'],
  standalone: true,
  imports: [
    IonRouterOutlet,
    IonSplitPane,
    IonMenu,
    IonHeader,
    IonToolbar,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonButtons,
    IonMenuButton,
    RouterModule,
    AlertComponent,
    LoadingComponent,
    ModalNewThreadComponent,
  ],
})
export class AuthorizedLayoutComponent {
  private authService = inject(AuthService);
  private socketService = inject(SocketService);
  private menuController = inject(MenuController);

  get entityInfo(): Entity { return this.authService.entityInfo; }
  get userInfo(): User { return this.authService.userInfo; }

  constructor() {
    this.socketService.connect();
  }
  
  async closeMenuOnMobile() {
    const splitPane = document.querySelector('ion-split-pane');
    const isDesktop = splitPane?.classList.contains('split-pane-visible');
    
    if (!isDesktop) {
      await this.menuController.close();
    }
  }

  async logout() {
    await this.authService.logout();
    await this.menuController.close();
  }
}