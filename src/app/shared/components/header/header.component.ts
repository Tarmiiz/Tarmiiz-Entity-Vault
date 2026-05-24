import { Component, Input, OnInit, OnDestroy, inject, signal } from '@angular/core';
import {
  IonHeader, IonTitle, IonToolbar, IonButtons, IonMenuButton, IonButton, IonLabel } from '@ionic/angular/standalone';
import { RouterLink, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { SocketService } from '../../services/socket.service';
import { AlertService } from '../alerts/alert/alert.service';
import { ModalResyncService } from '../modal-resync/modal-resync.service';
import { MenuController } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  imports: [CommonModule, IonLabel,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonMenuButton, IonButton, RouterLink, TranslatePipe
  ]
})
export class HeaderComponent  implements OnInit, OnDestroy {
  @Input() title!: string;
  private authService = inject(AuthService);
  private apiService = inject(ApiService);
  private socketService = inject(SocketService);
  private router = inject(Router);
  private vaultSub?: Subscription;
  private resyncService = inject(ModalResyncService);
  private translate = inject(TranslateService);

  unreadCount = signal(0);
  syncing = signal(false);

  get userInfo() {
    return this.authService.userInfo;
  }

  get entityActive() {
    return this.authService.entityActive();
  }

  get entityStateName() {
    return this.authService.entityInfo?.stateName ?? '';
  }

  get entityStateReason() {
    return this.authService.entityStateReason();
  }

  private alertService = inject(AlertService);
  private menuController = inject(MenuController);

  get profileRoute(): string {
    const user = this.authService.userInfo;
    return user?.role === 1
      ? '/authorized/users/details/' + user.userId
      : '/authorized/users/my-profile';
  }

  constructor() {}

  ngOnInit() {
    this.vaultSub = this.socketService.vaultUpdated$.subscribe((payload: any) => {
      if (this.syncing()) this.syncing.set(false);
      if (payload?.type === 'connect' || payload?.type === 'all') this.refreshUnread();
    });
    this.refreshUnread();
  }

  async openResyncModal() {
    try {
      const res: any = await this.apiService.vaultSyncStatus();
      const currentBlock    = Number(res?.current_block ?? 0);
      const lastSyncedBlock = Number(res?.last_synced_block ?? 0);
      const isSyncing       = res?.is_syncing ?? false;

      if (isSyncing) this.syncing.set(true);

      const resyncResult = await this.resyncService.show(currentBlock, lastSyncedBlock, isSyncing);
      if (resyncResult !== null) {
        const result: any = await this.apiService.vaultSyncResync(resyncResult.fromBlock, resyncResult.mode);
        if (result?.error || result?.type === 'error') {
          await this.alertService.show(this.translate.instant('alerts.failed'), result?.error || this.translate.instant('alerts.unexpected'));
        } else {
          this.syncing.set(true);
        }
      }
    } catch (err: any) {
      await this.alertService.show(this.translate.instant('alerts.error'), err?.message || this.translate.instant('alerts.unexpected'));
    }
  }

  ngOnDestroy() { this.vaultSub?.unsubscribe(); }

  async refreshUnread() {
    try {
      const res: any = await this.apiService.connectInboxInfo();
      const n = Number(res?.inbox?.unread ?? 0);
      this.unreadCount.set(isNaN(n) ? 0 : n);
    } catch { /* ignore */ }
  }

  gotoMessages() {
    this.router.navigate(['/authorized/messages/list']);
  }

  showReasonAlert() {
    this.alertService.show('State Change Reason', this.entityStateReason || 'No reason provided.', 'OK', 'max-w-3xl');
  }

  async logout() {
    await this.authService.logout();
    await this.menuController.close();
  }


}
