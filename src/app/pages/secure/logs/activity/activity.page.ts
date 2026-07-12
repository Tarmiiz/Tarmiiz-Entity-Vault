import { Component, OnInit, signal, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { applyPdfFooter } from '../../../../shared/utils/pdf-export.utils';
import { ActivityLog } from '../../../../shared/models/data.model';

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
  imports: [CommonModule, FormsModule, HeaderComponent]
})
export class ActivityPage implements OnInit {
  protected apiService = inject(ApiService);
  protected authService = inject(AuthService);
  protected loadingService = inject(LoadingService);
  utils = inject(UtilsService);

  activeTab = signal<'activity' | 'state'>('activity');

  activityRows = signal<ActivityLog[]>([]);
  activityTotal = signal(0);
  stateRows = signal<StateChangeLog[]>([]);
  stateTotal = signal(0);

  filterCategory = signal<string>('');
  page = signal(1);
  readonly pageSize = 25;

  total = computed(() => this.activeTab() === 'activity' ? this.activityTotal() : this.stateTotal());
  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  async ngOnInit() {}

  async ionViewDidEnter() {
    await this.load();
  }

  setTab(tab: 'activity' | 'state') {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.page.set(1);
    this.load();
  }

  async load() {
    this.loadingService.show('Loading logs...');
    const start = (this.page() - 1) * this.pageSize + 1;
    try {
      if (this.activeTab() === 'activity') {
        const data: any = await this.apiService.vaultGetActivityLogs(start, this.pageSize, this.filterCategory() || undefined);
        this.activityRows.set(data?.logs || []);
        this.activityTotal.set(Number(data?.count ?? 0));
      } else {
        const data: any = await this.apiService.vaultGetAllStateChangeLogs(start, this.pageSize);
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

  clearFilters() {
    this.filterCategory.set('');
    this.applyFilters();
  }

  nextPage() {
    if (this.page() < this.totalPages()) { this.page.set(this.page() + 1); this.load(); }
  }
  prevPage() {
    if (this.page() > 1) { this.page.set(this.page() - 1); this.load(); }
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
      const data: any = await this.apiService.vaultGetActivityLogs(start, ActivityPage.EXPORT_CHUNK, this.filterCategory() || undefined);
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
      const data: any = await this.apiService.vaultGetAllStateChangeLogs(start, ActivityPage.EXPORT_CHUNK);
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
    this.loadingService.show('Preparing export...');
    let stateRows: StateChangeLog[] = [];
    let activityRows: ActivityLog[] = [];
    try {
      if (isState) stateRows = await this.loadAllStateRows();
      else activityRows = await this.loadAllActivityRows();
    } finally {
      this.loadingService.hide();
    }
    const rows = isState
      ? stateRows.map(r => ({
          'Time': this.utils.formatDate(r.created_at),
          'Type': r.type,
          'Action': (r.action || '').replaceAll('_', ' '),
          'Address': r.address,
          'New Value': r.new_value,
          'Reason': r.reason,
          'User': this.userExportLabel(r),
          'Client IP': r.client_ip || '',
          'Tx Hash': r.tx_hash,
        }))
      : activityRows.map(r => ({
          'Time': this.utils.formatDate(r.created_at),
          'Category': r.category,
          'Action': r.action,
          'Target': r.target,
          'Details': r.details,
          'User': this.userExportLabel(r),
          'Client IP': r.client_ip || '',
        }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isState ? 'State Changes' : 'Activity');
    XLSX.writeFile(wb, `${isState ? 'state_change_logs' : 'activity_logs'}_${this.exportStamp()}.xlsx`);
  }

  async exportPdf() {
    const isState = this.activeTab() === 'state';
    this.loadingService.show('Preparing export...');
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
    doc.text(isState ? 'State Change Logs' : 'Activity Logs', 14, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: 26,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [isState
        ? ['Time', 'Type', 'Action', 'Address', 'New Value', 'Reason', 'User', 'Client IP']
        : ['Time', 'Category', 'Action', 'Target', 'Details', 'User', 'Client IP']],
      body: isState
        ? stateRows.map(r => [
            this.utils.formatDate(r.created_at),
            r.type,
            (r.action || '').replaceAll('_', ' '),
            this.shortAddr(r.address),
            r.new_value,
            r.reason || '',
            this.userExportLabel(r),
            r.client_ip || '',
          ])
        : activityRows.map(r => [
            this.utils.formatDate(r.created_at),
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

  get title(): string { return 'Activity Logs'; }
}
