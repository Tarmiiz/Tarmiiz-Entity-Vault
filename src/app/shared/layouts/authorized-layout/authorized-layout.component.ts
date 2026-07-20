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

  // User Management group: Users / User Groups / Menu Settings / Approval Settings
  // (all admin only) + Approvals. Admin-only — for a non-admin the group would wrap
  // just "Approvals", so exec sees a standalone top-level Approvals item instead.
  get userManagementGroupVisible(): boolean {
    return Number(this.userInfo?.role) === 1;
  }

  // Tenant avatar (public endpoint) used as the sidebar logo; static logo fallback on 404.
  get avatarUrl(): string { return this.apiService.avatarUrl; }
  onLogoError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (img && !img.src.endsWith('assets/images/logo.svg')) img.src = 'assets/images/logo.svg';
  }

  dexExpanded = signal(false);
  toggleDex() { this.dexExpanded.update(v => !v); }

  analyticsExpanded = signal(false);
  toggleAnalytics() { this.analyticsExpanded.update(v => !v); }

  userManagementExpanded = signal(false);
  toggleUserManagement() { this.userManagementExpanded.update(v => !v); }

  pendingApprovalsCount = signal(0);
  unreadMessagesCount = signal(0);

  constructor() {
    this.socketService.connect();
    this.socketService.approvalsCreated$.subscribe(() => this.refreshPendingCount());
    this.socketService.approvalsDecided$.subscribe(() => this.refreshPendingCount());
    // Refresh the unread-messages badge on any Connect update (new inbound
    // message, or a message marked read elsewhere) — mirrors the messages list page.
    this.socketService.vaultUpdated$.subscribe(p => {
      if (p.type === 'connect' || p.type === 'all') this.refreshUnreadMessages();
    });
  }

  ionViewWillEnter() {
    this.refreshPendingCount();
    this.refreshUnreadMessages();
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

  private async refreshUnreadMessages() {
    const u = this.userInfo;
    if (!u) return;
    // Only poll when the Messages module is actually visible to this user — a
    // Security officer without the per-user grant would otherwise 403 (swallowed).
    if (!this.features.menuEnabled('messages')) { this.unreadMessagesCount.set(0); return; }
    try {
      const res: any = await this.apiService.connectInboxInfo();
      this.unreadMessagesCount.set(Number(res?.inbox?.unread ?? 0));
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