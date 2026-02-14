import { Component, inject } from '@angular/core';
import {
  IonRouterOutlet, IonSplitPane, IonMenu, IonHeader, IonToolbar,
  IonContent, IonList, IonItem, IonLabel,
  IonButtons, IonMenuButton, MenuController, IonAccordionGroup, IonAccordion, IonFooter } from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { Regulator, User } from '../../models/data.model';
import { AlertComponent } from '../../components/alerts/alert/alert.component';
import { LoadingComponent } from "../../components/alerts/loading/loading.component";

@Component({
  selector: 'app-authorized-layout',
  templateUrl: './authorized-layout.component.html',
  styleUrls: ['./authorized-layout.component.scss'],
  standalone: true,
  imports: [
    IonFooter,
    // IonAccordion, IonAccordionGroup,
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
  ],
})
export class AuthorizedLayoutComponent {
  private authService = inject(AuthService);
  private menuController = inject(MenuController);

  regulatorInfo!: Regulator;
  userInfo!: User;

  constructor() {}

  ionViewWillEnter() {
    this.regulatorInfo = this.authService.regulatorInfo;
    this.userInfo = this.authService.userInfo;
    // console.log('regulatorInfo', this.regulatorInfo);
    // console.log('userInfo', this.userInfo);
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