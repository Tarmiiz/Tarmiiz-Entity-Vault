import { Component, OnDestroy, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { HeaderComponent } from '../../../../shared/components/header/header.component';

import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';

import { PendingApproval } from '../../../../shared/models/data.model';
import { PaginatorComponent, pageSlice } from '../../../../shared/components/paginator/paginator.component';

@Component({
  selector: 'app-approvals-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, HeaderComponent, PaginatorComponent],
})
export class ListPage implements OnInit, OnDestroy {
  private apiService     = inject(ApiService);
  private authService    = inject(AuthService);
  private socketService  = inject(SocketService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);
  private utils          = inject(UtilsService);

  approvals = signal<PendingApproval[]>([]);
  count     = signal(0);

  filterState = signal<string>('1'); // default: Pending
  searchTerm  = signal('');

  loading = signal(false);

  private subs: Subscription[] = [];
  private _myRole = signal<'none' | 'maker' | 'checker'>('none');
  myApprovalRole = computed(() => this._myRole());

  get userInfo() { return this.authService.userInfo; }

  ngOnInit() {
    this.subs.push(this.socketService.approvalsCreated$.subscribe(() => this.load()));
    this.subs.push(this.socketService.approvalsDecided$.subscribe(() => this.load()));
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  async ionViewWillEnter() {
    await this.refreshMyRole();
  }

  async ionViewDidEnter() {
    await this.load();
  }

  private async refreshMyRole() {
    const me = this.userInfo;
    if (!me?.userId) { this._myRole.set('none'); return; }
    try {
      const res = await this.apiService.vaultUserApprovalRoleGet(me.userId);
      this._myRole.set((res?.approvalRole as any) || 'none');
    } catch { this._myRole.set('none'); }
  }

  async load() {
    this.loading.set(true);
    try {
      const stateFilter = this.filterState();
      const opts: any = { offset: 200 };
      if (stateFilter) opts.state = Number(stateFilter);
      const res = await this.apiService.vaultApprovalsList(opts);
      const rows: PendingApproval[] = (res?.approvals ?? []).map(PendingApproval.fromApi);
      this.approvals.set(rows);
      this.count.set(Number(res?.count ?? rows.length));
    } finally {
      this.loading.set(false);
    }
  }

  /** 1-based, per frontend Standard 1.5. */
  approvalsPage = signal(1);
  approvalsPageSize = signal(25);
  pagedApprovals = computed(() => pageSlice(this.filtered(), this.approvalsPage(), this.approvalsPageSize()));
  filtered = computed(() => {
    const t = this.searchTerm().trim().toLowerCase();
    if (!t) return this.approvals();
    return this.approvals().filter(a =>
      a.actionCategory.toLowerCase().includes(t)  ||
      a.targetAddress.toLowerCase().includes(t)   ||
      (a.targetLabel || '').toLowerCase().includes(t) ||
      (a.makerUserName || '').toLowerCase().includes(t) ||
      a.requestId.toLowerCase().includes(t),
    );
  });

  canDecide(a: PendingApproval): boolean {
    if (a.approvalState !== 1) return false;
    const me = this.userInfo;
    if (!me || Number(me.role) !== 2) return false;
    if (String(me.userId) === String(a.makerUserId)) return false;
    return this.myApprovalRole() === 'checker';
  }

  canCancel(a: PendingApproval): boolean {
    if (a.approvalState !== 1) return false;
    const me = this.userInfo;
    if (!me) return false;
    return String(me.userId) === String(a.makerUserId);
  }

  async approve(a: PendingApproval) {
    const approveLabel = this.translate.instant('approvals.list.approve');
    const message = this.translate.instant('approvals.list.approveConfirm', { category: a.actionCategory, target: a.targetLabel || a.targetAddress });
    const ok = await this.alertService.show(approveLabel, message, approveLabel);
    if (!ok) return;
    this.loadingService.show(this.translate.instant('approvals.list.approving'));
    try {
      const res = await this.apiService.vaultApprovalApprove(a.requestId);
      if (res?.error) this.alertService.info(this.translate.instant('alerts.error'), res.error);
      else            await this.load();
    } finally {
      this.loadingService.hide();
    }
  }

  async reject(a: PendingApproval) {
    const reason = window.prompt(this.translate.instant('approvals.list.rejectReasonPrompt'), '');
    if (!reason || !reason.trim()) return;
    const rejectLabel = this.translate.instant('approvals.list.reject');
    const message = this.translate.instant('approvals.list.rejectConfirm', { category: a.actionCategory, target: a.targetLabel || a.targetAddress });
    const ok = await this.alertService.show(rejectLabel, message, rejectLabel);
    if (!ok) return;
    this.loadingService.show(this.translate.instant('approvals.list.rejecting'));
    try {
      const res = await this.apiService.vaultApprovalReject(a.requestId, reason.trim());
      if (res?.error) this.alertService.info(this.translate.instant('alerts.error'), res.error);
      else            await this.load();
    } finally {
      this.loadingService.hide();
    }
  }

  async cancel(a: PendingApproval) {
    const withdrawLabel = this.translate.instant('approvals.list.withdraw');
    const message = this.translate.instant('approvals.list.cancelConfirm', { id: a.requestId.slice(0, 8) });
    const ok = await this.alertService.show(this.translate.instant('approvals.list.cancelRequestTitle'), message, withdrawLabel);
    if (!ok) return;
    this.loadingService.show(this.translate.instant('approvals.list.cancelling'));
    try {
      const res = await this.apiService.vaultApprovalCancel(a.requestId);
      if (res?.error) this.alertService.info(this.translate.instant('alerts.error'), res.error);
      else            await this.load();
    } finally {
      this.loadingService.hide();
    }
  }

  // `created_at` / `decided_at` are millisecond epochs — formatTime, not formatDate
  // (the latter multiplies by 1000 for raw on-chain seconds).
  formatDate(ms: number | null): string {
    if (!ms) return '';
    return this.utils.formatTime(ms);
  }

  stateBadgeClass(s: number): string {
    switch (s) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-red-100 text-red-800';
      case 4: return 'bg-gray-200 text-gray-700';
      case 5: return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  }
}
