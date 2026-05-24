import { Component, inject, signal } from '@angular/core';
import {
  IonRouterOutlet, IonSplitPane, IonMenu, IonHeader, IonFooter, IonToolbar,
  IonContent, IonList, IonItem, IonLabel,
  IonButtons, IonMenuButton, MenuController } from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { SocketService } from '../../services/socket.service';
import { FeaturesService } from '../../services/features.service';
import { ApiService } from '../../services/api.service';
import { Entity, User } from '../../models/data.model';
import { ModalNewThreadComponent } from "../../../pages/secure/messages/modals/modal-new-thread/modal-new-thread.component";
import { ModalResyncComponent } from "../../components/modal-resync/modal-resync.component";

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
    IonFooter,
    IonToolbar,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonButtons,
    IonMenuButton,
    RouterModule,
    TranslatePipe,
    ModalNewThreadComponent,
    ModalResyncComponent,
  ],
})
export class AuthorizedLayoutComponent {
  private authService = inject(AuthService);
  private socketService = inject(SocketService);
  private apiService = inject(ApiService);
  private menuController = inject(MenuController);
  private languageService = inject(LanguageService);
  features = inject(FeaturesService);

  get lang() { return this.languageService.lang(); }
  toggleLang() { this.languageService.toggle(); }

  get entityInfo(): Entity { return this.authService.entityInfo; }
  get userInfo(): User { return this.authService.userInfo; }

  dexExpanded = signal(false);
  toggleDex() { this.dexExpanded.update(v => !v); }

  analyticsExpanded = signal(false);
  toggleAnalytics() { this.analyticsExpanded.update(v => !v); }

  pendingApprovalsCount = signal(0);

  constructor() {
    this.socketService.connect();
    this.socketService.approvalsCreated$.subscribe(() => this.refreshPendingCount());
    this.socketService.approvalsDecided$.subscribe(() => this.refreshPendingCount());
  }

  ionViewWillEnter() {
    this.refreshPendingCount();
  }

  private async refreshPendingCount() {
    const u = this.userInfo;
    if (!u) return;
    const role = Number(u.role);
    if (role !== 1 && role !== 2) { this.pendingApprovalsCount.set(0); return; }
    try {
      const res = await this.apiService.vaultApprovalsList({ state: 1, offset: 1 });
      this.pendingApprovalsCount.set(Number(res?.count ?? 0));
    } catch { /* swallow */ }
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