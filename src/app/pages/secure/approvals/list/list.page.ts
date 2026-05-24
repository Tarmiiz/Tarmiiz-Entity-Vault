import { Component, OnDestroy, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { HeaderComponent } from '../../../../shared/components/header/header.component';

import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';

import { PendingApproval } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-approvals-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, HeaderComponent],
})
export class ListPage implements OnInit, OnDestroy {
  private apiService     = inject(ApiService);
  private authService    = inject(AuthService);
  private socketService  = inject(SocketService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private router         = inject(Router);

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
    const ok = await this.alertService.show('Approve', `Approve ${a.actionCategory} on ${a.targetLabel || a.targetAddress}? This will run the on-chain call now.`, 'Approve');
    if (!ok) return;
    this.loadingService.show('Approving...');
    try {
      const res = await this.apiService.vaultApprovalApprove(a.requestId);
      if (res?.error) this.alertService.show('Error', res.error);
      else            await this.load();
    } finally {
      this.loadingService.hide();
    }
  }

  async reject(a: PendingApproval) {
    const reason = window.prompt('Reject reason (required):', '');
    if (!reason || !reason.trim()) return;
    const ok = await this.alertService.show('Reject', `Reject ${a.actionCategory} on ${a.targetLabel || a.targetAddress}?`, 'Reject');
    if (!ok) return;
    this.loadingService.show('Rejecting...');
    try {
      const res = await this.apiService.vaultApprovalReject(a.requestId, reason.trim());
      if (res?.error) this.alertService.show('Error', res.error);
      else            await this.load();
    } finally {
      this.loadingService.hide();
    }
  }

  async cancel(a: PendingApproval) {
    const ok = await this.alertService.show('Cancel request', `Withdraw your request ${a.requestId.slice(0, 8)}?`, 'Withdraw');
    if (!ok) return;
    this.loadingService.show('Cancelling...');
    try {
      const res = await this.apiService.vaultApprovalCancel(a.requestId);
      if (res?.error) this.alertService.show('Error', res.error);
      else            await this.load();
    } finally {
      this.loadingService.hide();
    }
  }

  openPolicy() {
    this.router.navigate(['/authorized/approvals/policy']);
  }

  formatDate(ms: number | null): string {
    if (!ms) return '';
    return new Date(ms).toLocaleString();
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
