import { Component, OnInit, signal, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { applyPdfFooter } from '../../../../shared/utils/pdf-export.utils';
import { ActivityLog, User } from '../../../../shared/models/data.model';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';

interface StateChangeLog {
  id: number;
  address: string;
  type: string;
  action: string;
  new_value: string;
  reason: string;
  caller: string;
  tx_hash: string;
  block_number: number;
  user_id: number | null;
  user_name: string;
  client_ip: string;
  created_at: number;
  time?: number; // canonical display timestamp (ms), computed API-side
}

// Off-chain operational trail (logs_activity: page navigation / exports /
// approvals, recorded by the dashboard on every user action) + the
// logs_state_changes mirror. Complements the on-chain audit trail pages —
// together they are the Security officer's complete log surface.
@Component({
  selector: 'app-logs-activity',
  templateUrl: './activity.page.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, HeaderComponent, TranslatePipe, PaginatorComponent]
})
export class ActivityPage implements OnInit {
  protected apiService = inject(ApiService);
  protected authService = inject(AuthService);
  protected loadingService = inject(LoadingService);
  protected translate = inject(TranslateService);
  utils = inject(UtilsService);

  activeTab = signal<'activity' | 'state'>('activity');

  activityRows = signal<ActivityLog[]>([]);
  activityTotal = signal(0);
  stateRows = signal<StateChangeLog[]>([]);
  stateTotal = signal(0);

  // Per-tab filters — same set as the Regulator Dashboard's logs page
  // (category/type + user + date range + action substring).
  filterCategory = signal<string>('');
  activityUserFilter = signal<string>('');
  activityFromFilter = signal<string>('');
  activityToFilter = signal<string>('');
  activityActionFilter = signal<string>('');

  stateTypeFilter = signal<string>('');
  stateUserFilter = signal<string>('');
  stateFromFilter = signal<string>('');
  stateToFilter = signal<string>('');
  stateActionFilter = signal<string>('');

  // Users for the actor dropdown (role 4 is allow-listed on GET /vault/users).
  users = signal<User[]>([]);

  private actionDebounce: any = null;

  page = signal(1);
  pageSize = signal(25);

  readonly activityCategories = ['navigation', 'export', 'filter', 'view', 'auth', 'action', 'approval', 'admin'];
  // Every type written into logs_state_changes — the API's own writers plus the
  // Entity Sync plugin's AnnouncedEventsDecoder ('entity' / 'party').
  readonly stateTypes = ['asset', 'asset_service', 'entity', 'party', 'service', 'subscription', 'user'];

  total = computed(() => this.activeTab() === 'activity' ? this.activityTotal() : this.stateTotal());
  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  async ngOnInit() {}

  async ionViewDidEnter() {
    this.loadUsers();
    await this.load();
  }

  ionViewWillLeave() {
    if (this.actionDebounce) clearTimeout(this.actionDebounce);
    this.actionDebounce = null;
  }

  async loadUsers() {
    try {
      const data = await this.apiService.vaultGetUsers(0, 500);
      this.users.set(data?.users || []);
    } catch {
      this.users.set([]);
    }
  }

  setTab(tab: 'activity' | 'state') {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.page.set(1);
    this.load();
  }

  // Filter argument tuples — one source of truth for both the paged load and
  // the export loaders (which must honour the same filters).
  private activityArgs(): [string | undefined, number | undefined, number | undefined, number | undefined, string | undefined] {
    return [
      this.filterCategory() || undefined,
      this.activityUserFilter() ? Number(this.activityUserFilter()) : undefined,
      this.toEpochStart(this.activityFromFilter()),
      this.toEpochEnd(this.activityToFilter()),
      this.activityActionFilter().trim() || undefined,
    ];
  }

  private stateArgs(): [string | undefined, number | undefined, number | undefined, number | undefined, string | undefined] {
    return [
      this.stateTypeFilter() || undefined,
      this.stateUserFilter() ? Number(this.stateUserFilter()) : undefined,
      this.toEpochStart(this.stateFromFilter()),
      this.toEpochEnd(this.stateToFilter()),
      this.stateActionFilter().trim() || undefined,
    ];
  }

  private toEpochStart(value: string): number | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    if (isNaN(d.getTime())) return undefined;
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  private toEpochEnd(value: string): number | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    if (isNaN(d.getTime())) return undefined;
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  async load() {
    this.loadingService.show(this.translate.instant('logs.activity.loading'));
    const start = (this.page() - 1) * this.pageSize() + 1;
    try {
      if (this.activeTab() === 'activity') {
        const data: any = await this.apiService.vaultGetActivityLogs(start, this.pageSize(), ...this.activityArgs());
        this.activityRows.set(data?.logs || []);
        this.activityTotal.set(Number(data?.count ?? 0));
      } else {
        const data: any = await this.apiService.vaultGetAllStateChangeLogs(start, this.pageSize(), ...this.stateArgs());
        this.stateRows.set(data?.logs || []);
        this.stateTotal.set(Number(data?.count ?? 0));
      }
    } finally {
      this.loadingService.hide();
    }
  }

  applyFilters() {
    this.page.set(1);
    this.load();
  }

  // The action inputs are free text — debounce so each keystroke isn't a query.
  onActionChange(value: string) {
    if (this.activeTab() === 'activity') this.activityActionFilter.set(value);
    else this.stateActionFilter.set(value);
    if (this.actionDebounce) clearTimeout(this.actionDebounce);
    this.actionDebounce = setTimeout(() => this.applyFilters(), 300);
  }

  // Clears the ACTIVE tab's filters only (each tab has its own set).
  clearFilters() {
    if (this.activeTab() === 'activity') {
      this.filterCategory.set('');
      this.activityUserFilter.set('');
      this.activityFromFilter.set('');
      this.activityToFilter.set('');
      this.activityActionFilter.set('');
    } else {
      this.stateTypeFilter.set('');
      this.stateUserFilter.set('');
      this.stateFromFilter.set('');
      this.stateToFilter.set('');
      this.stateActionFilter.set('');
    }
    this.applyFilters();
  }

  /**
   * Server-paged: a page move refetches. Both setters bail on a no-op, because
   * <app-paginator> fires pageSizeChange AND pageChange(1) for one size change —
   * without the guard that is two requests.
   */
  setPage(p: number) {
    if (p < 1 || p > this.totalPages() || p === this.page()) return;
    this.page.set(p);
    this.load();
  }

  setPageSize(size: number) {
    if (size === this.pageSize()) return;
    this.pageSize.set(size);
    this.page.set(1);
    this.load();
  }

  shortAddr(addr: string | null | undefined): string {
    return this.utils.shortAddr(addr);
  }

  // ─── Export (mirrors the Audit Trail pages) ─────────────────────────────────

  private userExportLabel(log: { user_name?: string | null; user_id?: number | null }): string {
    if (log.user_name) return `${log.user_name} (#${log.user_id})`;
    return log.user_id ? `#${log.user_id}` : '';
  }

  private exportStamp(): string {
    return new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  }

  // Fetch EVERY row matching the current filters for export (the tables stay
  // paged) — 500-row chunks; the hard cap bounds a filterless export.
  private static readonly EXPORT_CHUNK = 500;
  private static readonly EXPORT_CAP = 20000;

  private async loadAllActivityRows(): Promise<ActivityLog[]> {
    const all: ActivityLog[] = [];
    let start = 1;
    while (all.length < ActivityPage.EXPORT_CAP) {
      const data: any = await this.apiService.vaultGetActivityLogs(start, ActivityPage.EXPORT_CHUNK, ...this.activityArgs());
      const logs = data?.logs || [];
      all.push(...logs);
      const count = Number(data?.count ?? 0);
      if (!logs.length || all.length >= count) break;
      start += logs.length;
    }
    return all;
  }

  private async loadAllStateRows(): Promise<StateChangeLog[]> {
    const all: StateChangeLog[] = [];
    let start = 1;
    while (all.length < ActivityPage.EXPORT_CAP) {
      const data: any = await this.apiService.vaultGetAllStateChangeLogs(start, ActivityPage.EXPORT_CHUNK, ...this.stateArgs());
      const logs = data?.logs || [];
      all.push(...logs);
      const count = Number(data?.count ?? 0);
      if (!logs.length || all.length >= count) break;
      start += logs.length;
    }
    return all;
  }

  async exportExcel() {
    const isState = this.activeTab() === 'state';
    this.loadingService.show(this.translate.instant('common.preparingExport'));
    let stateRows: StateChangeLog[] = [];
    let activityRows: ActivityLog[] = [];
    try {
      if (isState) stateRows = await this.loadAllStateRows();
      else activityRows = await this.loadAllActivityRows();
    } finally {
      this.loadingService.hide();
    }
    const timeLabel = this.translate.instant('logs.table.time');
    const typeLabel = this.translate.instant('common.type');
    const actionLabel = this.translate.instant('logs.table.action');
    const addressLabel = this.translate.instant('common.address');
    const newValueLabel = this.translate.instant('logs.activity.newValue');
    const reasonLabel = this.translate.instant('logs.table.reason');
    const userLabel = this.translate.instant('logs.table.user');
    const clientIpLabel = this.translate.instant('logs.table.clientIp');
    const txHashLabel = this.translate.instant('logs.details.txHash');
    const categoryLabel = this.translate.instant('logs.table.category');
    const targetLabel = this.translate.instant('logs.table.target');
    const detailsLabel = this.translate.instant('logs.activity.details');
    const rows = isState
      ? stateRows.map(r => ({
          [timeLabel]: this.utils.formatTime(r.time),
          [typeLabel]: r.type,
          [actionLabel]: (r.action || '').replaceAll('_', ' '),
          [addressLabel]: r.address,
          [newValueLabel]: r.new_value,
          [reasonLabel]: r.reason,
          [userLabel]: this.userExportLabel(r),
          [clientIpLabel]: r.client_ip || '',
          [txHashLabel]: r.tx_hash,
        }))
      : activityRows.map(r => ({
          [timeLabel]: this.utils.formatTime(r.time),
          [categoryLabel]: r.category,
          [actionLabel]: r.action,
          [targetLabel]: r.target,
          [detailsLabel]: r.details,
          [userLabel]: this.userExportLabel(r),
          [clientIpLabel]: r.client_ip || '',
        }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, this.translate.instant(isState ? 'logs.activity.tabState' : 'logs.activity.tabActivity'));
    XLSX.writeFile(wb, `${isState ? 'state_change_logs' : 'activity_logs'}_${this.exportStamp()}.xlsx`);
  }

  async exportPdf() {
    const isState = this.activeTab() === 'state';
    this.loadingService.show(this.translate.instant('common.preparingExport'));
    let stateRows: StateChangeLog[] = [];
    let activityRows: ActivityLog[] = [];
    try {
      if (isState) stateRows = await this.loadAllStateRows();
      else activityRows = await this.loadAllActivityRows();
    } finally {
      this.loadingService.hide();
    }
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(this.translate.instant(isState ? 'logs.activity.exportTitleState' : 'sidebar.activityLogs'), 14, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: 26,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [isState
        ? [
            this.translate.instant('logs.table.time'),
            this.translate.instant('common.type'),
            this.translate.instant('logs.table.action'),
            this.translate.instant('common.address'),
            this.translate.instant('logs.activity.newValue'),
            this.translate.instant('logs.table.reason'),
            this.translate.instant('logs.table.user'),
            this.translate.instant('logs.table.clientIp'),
          ]
        : [
            this.translate.instant('logs.table.time'),
            this.translate.instant('logs.table.category'),
            this.translate.instant('logs.table.action'),
            this.translate.instant('logs.table.target'),
            this.translate.instant('logs.activity.details'),
            this.translate.instant('logs.table.user'),
            this.translate.instant('logs.table.clientIp'),
          ]],
      body: isState
        ? stateRows.map(r => [
            this.utils.formatTime(r.time),
            r.type,
            (r.action || '').replaceAll('_', ' '),
            this.shortAddr(r.address),
            r.new_value,
            r.reason || '',
            this.userExportLabel(r),
            r.client_ip || '',
          ])
        : activityRows.map(r => [
            this.utils.formatTime(r.time),
            r.category,
            r.action,
            r.target || '',
            r.details || '',
            this.userExportLabel(r),
            r.client_ip || '',
          ]),
    });
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`${isState ? 'state_change_logs' : 'activity_logs'}_${this.exportStamp()}.pdf`);
  }

  get title(): string { return this.translate.instant('sidebar.activityLogs'); }
}
