import { Component, Input, OnInit, inject } from '@angular/core';
import {
  IonHeader, IonTitle, IonToolbar, IonButtons, IonMenuButton, IonButton, IonLabel } from '@ionic/angular/standalone';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { UnreadMessagesService } from '../../services/unread-messages.service';
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
export class HeaderComponent  implements OnInit {
  @Input() title!: string;
  private authService = inject(AuthService);
  private apiService = inject(ApiService);
  private unreadMessages = inject(UnreadMessagesService);
  private router = inject(Router);

  /*
      🔴 READ-ONLY VIEW OF THE SHARED COUNT — do NOT give this component its own
      `vaultUpdated$` subscription or its own `connectInboxInfo()` call again.

      It had both until 2026-09-08, and so did the sidebar badge, so every socket event cost two
      identical fetches of the same endpoint. `app-header` is in 59 page templates and Ionic's
      router outlet RETAINS visited pages, so those subscriptions accumulated across navigation
      — one event fanned out to one request per retained page. See UnreadMessagesService.
  */
  unreadCount = this.unreadMessages.count;

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
    // Ask the shared service for a value; it debounces and de-duplicates, so N retained
    // headers asking at once still produce exactly one request.
    this.unreadMessages.refresh();
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
