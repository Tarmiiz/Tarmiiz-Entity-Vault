import { Component, OnDestroy, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../../shared/components/live-indicator/live-indicator.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { DexVenueMember, User } from '../../../../shared/models/data.model';
import { PaginatorComponent, pageSlice } from '../../../../shared/components/paginator/paginator.component';

/**
 * DEX Memberships — the member-brokerage side of venue membership (2026-08-05).
 * Lists the memberships this tenant's OWN type-1 services hold at foreign
 * venues. Lifecycle: the venue invites (Pending) → the member ACCEPTS here
 * (consent) → the VENUE's regulator approves (state 2) — only then can the
 * member's subscriptions trade at the venue.
 */
@Component({
  selector: 'app-dex-memberships',
  templateUrl: './memberships.page.html',
  styleUrls: ['./memberships.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, LiveIndicatorComponent, TranslatePipe, PaginatorComponent],
})
export class MembershipsPage implements OnInit, OnDestroy {
  private apiService     = inject(ApiService);
  private authService    = inject(AuthService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private socket         = inject(SocketService);
  private translate      = inject(TranslateService);
  utils = inject(UtilsService);
  features = inject(FeaturesService);

  userInfo!: User;

  memberships = signal<DexVenueMember[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  membershipsPage = signal(1);
  membershipsPageSize = signal(25);
  pagedMemberships = computed(() => pageSlice(this.memberships(), this.membershipsPage(), this.membershipsPageSize()));
  loaded = signal(false);
  refreshing = signal(false);

  private sub?: Subscription;

  ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      await this.loadMemberships();
    } finally {
      this.loadingService.hide();
      this.loaded.set(true);
    }
    // Member add/accept/remove notify on the dex-venue scope.
    this.sub = this.socket.vaultUpdated$.subscribe(async p => {
      if (p.type !== 'dex-venue') return;
      this.refreshing.set(true);
      try { await this.loadMemberships(); } finally { this.refreshing.set(false); }
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  private async loadMemberships() {
    const data = await this.apiService.vaultDexMemberships();
    this.memberships.set(data?.memberships ?? []);
  }

  canAct(): boolean {
    return !!this.userInfo && this.userInfo.role !== 3;
  }

  // addedAt / updatedAt are in MILLISECONDS — utils.formatDate expects seconds.
  formatMs(ms: number): string {
    if (!ms) return '—';
    return this.utils.formatDate(Math.floor(ms / 1000));
  }

  async acceptMembership(m: DexVenueMember) {
    const ok = await this.alertService.show(
      this.translate.instant('dex.memberships.acceptModal.title'),
      this.translate.instant('dex.memberships.acceptModal.message', { venue: m.venueName || m.dexService }),
      this.translate.instant('dex.memberships.acceptModal.confirm'),
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('dex.memberships.accepting'));
    try {
      const res = await this.apiService.vaultDexMembershipAccept(m.dexService, m.memberService);
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else if (res?.requestId) {
        this.alertService.show(
          this.translate.instant('approvals.submittedTitle'),
          this.translate.instant('approvals.submittedMessage'),
          this.translate.instant('alerts.ok'),
        );
      } else {
        await this.loadMemberships();
      }
    } finally {
      this.loadingService.hide();
    }
  }

  async exitMembership(m: DexVenueMember) {
    const ok = await this.alertService.show(
      this.translate.instant('dex.memberships.exitModal.title'),
      this.translate.instant('dex.memberships.exitModal.message', { venue: m.venueName || m.dexService }),
      this.translate.instant('dex.memberships.exitModal.confirm'),
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('dex.memberships.exiting'));
    try {
      const res = await this.apiService.vaultDexMembershipRemove(m.dexService, m.memberService);
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else if (res?.requestId) {
        this.alertService.show(
          this.translate.instant('approvals.submittedTitle'),
          this.translate.instant('approvals.submittedMessage'),
          this.translate.instant('alerts.ok'),
        );
      } else {
        await this.loadMemberships();
      }
    } finally {
      this.loadingService.hide();
    }
  }
}
