import { Component, Input, OnInit, OnDestroy, inject, signal } from '@angular/core';
import {
  IonHeader, IonTitle, IonToolbar, IonButtons, IonMenuButton, IonButton, IonLabel } from '@ionic/angular/standalone';
import { RouterLink, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { SocketService } from '../../services/socket.service';
import { AlertService } from '../alerts/alert/alert.service';
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

  unreadCount = signal(0);

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
  private translate = inject(TranslateService);

  get profileRoute(): string {
    // Every role lands on their personal My Profile page (view details + change password).
    return '/authorized/users/my-profile';
  }

  constructor() {}

  ngOnInit() {
    this.vaultSub = this.socketService.vaultUpdated$.subscribe((payload: any) => {
      if (payload?.type === 'connect' || payload?.type === 'all') this.refreshUnread();
    });
    this.refreshUnread();
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
    this.alertService.info(
      this.translate.instant('header.stateReasonAlert.title'),
      this.entityStateReason || this.translate.instant('header.stateReasonAlert.noReason'),
      this.translate.instant('alerts.ok'),
      'max-w-3xl'
    );
  }

  async logout() {
    await this.authService.logout();
    await this.menuController.close();
  }


}
