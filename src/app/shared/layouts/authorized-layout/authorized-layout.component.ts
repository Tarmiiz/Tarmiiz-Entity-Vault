import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  IonRouterOutlet, IonSplitPane, IonMenu, IonList, IonItem, IonLabel,
  IonButtons, IonMenuButton, MenuController } from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { SocketService } from '../../services/socket.service';
import { FeaturesService } from '../../services/features.service';
import { ApiService } from '../../services/api.service';
import { UnreadMessagesService } from '../../services/unread-messages.service';
import { LiveStatusService } from '../../services/live-status.service';
import { PageTitleService } from '../../services/page-title.service';
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
export class AuthorizedLayoutComponent implements OnDestroy {
  private authService = inject(AuthService);
  // PUBLIC because the top-bar connection badge reads it (Phase 35 / F2 — the
  // badge used to report "a page is mounted" and call that Live).
  socketService = inject(SocketService);
  private apiService = inject(ApiService);
  private unreadMessages = inject(UnreadMessagesService);
  private menuController = inject(MenuController);
  private languageService = inject(LanguageService);
  private router = inject(Router);
  features = inject(FeaturesService);

  /* Live/Refreshing badge. Pages still declare themselves live the same way —
     <app-live-indicator [refreshing]="refreshing()"> — but that component now
     reports here instead of drawing, so the badge shows once in the bar rather
     than as a grey strip on each of 22 pages. */
  live = inject(LiveStatusService);

  /* Page title, reported by app-header from all 59 pages. */
  pageTitle = inject(PageTitleService);

  /* ── The GLOBAL TOP BAR lives here now (v4 shell, phase 3) ──────────────────
     It moved out of header.component because a bar rendered inside a page can
     only ever span the split-pane's CONTENT pane — it starts where the sidebar
     ends. v4's bar spans the whole window and carries the logo, so it has to be
     a sibling ABOVE the split-pane, which is here.
     header.component keeps the page TITLE (and the entity-restricted banner) and
     now renders it as a heading inside the content, matching v4 where the panel
     holds "Company Name Dashboard" and the bar holds the identity + actions.
     Consequence: these five actions are duplicated from header.component and
     REMOVED there — do not leave a copy in both. */
  get lang() { return this.languageService.lang(); }
  toggleLang() { this.languageService.toggle(); }

  gotoMessages() { this.router.navigate(['/authorized/messages/list']); }

  // Every role lands on their personal My Profile page.
  get profileRoute(): string { return '/authorized/users/my-profile'; }

  /* Sidebar collapse (v4: 250px panel ⇄ 64px icon rail). The menu had NO collapse
     state before — this is new. Persisted so it survives navigation and reloads;
     the split-pane keeps owning the mobile drawer, so this only affects the
     docked desktop width. */
  menuCollapsed = signal<boolean>(this.readCollapsed());
  toggleMenuCollapsed() {
    this.menuCollapsed.update(v => !v);
    try { localStorage.setItem('shell-menu-collapsed', this.menuCollapsed() ? '1' : '0'); } catch { /* private mode */ }
  }
  private readCollapsed(): boolean {
    try { return localStorage.getItem('shell-menu-collapsed') === '1'; } catch { return false; }
  }

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

  /*
      Read-only view of the shared count — the inbox subscription and fetch that used to live
      here are gone. They duplicated the header badge's identical request on every socket event.
  */
  unreadMessagesCount = this.unreadMessages.count;

  /*
      🔴 EVERY SUBSCRIPTION MADE HERE MUST BE TORN DOWN IN `ngOnDestroy`.

      This component had THREE subscriptions and no `ngOnDestroy` at all until 2026-09-08.
      `SocketService` is `providedIn: 'root'`, so its Subjects outlive the component, and the
      login page lives OUTSIDE this layout — so every logout→login in the same tab built a new
      layout whose subscriptions stacked on top of the previous one's. After k login cycles a
      single `vault:updated` fired k badge refreshes. That is half of the measured 451 req/s.
  */
  private subs: Subscription[] = [];

  constructor() {
    // Not awaited by design (a constructor cannot await) — SocketService itself guards against
    // the concurrent-call race that this and AuthService.login used to create between them.
    void this.socketService.connect();
    this.subs.push(
      this.socketService.approvalsCreated$.subscribe(() => this.refreshPendingCount()),
      this.socketService.approvalsDecided$.subscribe(() => this.refreshPendingCount()),
    );
  }

  ngOnDestroy() {
    for (const s of this.subs) s.unsubscribe();
    this.subs = [];
  }

  ionViewWillEnter() {
    this.refreshPendingCount();
    this.unreadMessages.refresh();
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