import { Component, OnInit, signal, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AuditLog } from '../../../../shared/models/data.model';

const AUDIT_CATEGORIES = [
  'User', 'Role', 'Auth', 'State', 'Config', 'Document', 'Entity',
  'Service', 'Subscription', 'Asset', 'Credit', 'DEX', 'Identity',
  'Connect', 'Regulator', 'Validator', 'Payment Processor'
];

@Component({
  selector: 'app-logs-my',
  templateUrl: './my.page.html',
  styleUrls: ['./my.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, HeaderComponent]
})
export class MyPage implements OnInit {
  protected apiService = inject(ApiService);
  protected socketService = inject(SocketService);
  protected loadingService = inject(LoadingService);
  protected router = inject(Router);
  utils = inject(UtilsService);

  readonly categories = AUDIT_CATEGORIES;

  rows = signal<AuditLog[]>([]);
  total = signal(0);
  page = signal(1);
  readonly pageSize = 25;

  filterFrom = signal<string>('');
  filterTo = signal<string>('');
  filterCategory = signal<string>('');
  filterAction = signal<string>('');

  // Tamper-evidence banner state (GET /audit/verify)
  verifyState = signal<{ ok: boolean; anchored: boolean; untilBlock?: number; brokenAt?: number; loading: boolean }>({ ok: true, anchored: false, loading: true });

  uniqueActions = computed(() => [...new Set(this.rows().map(r => r.action).filter(Boolean))].sort());

  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  private _socketSub: Subscription | null = null;
  private _refreshTimer: any = null;

  async ngOnInit() {}

  async ionViewDidEnter() {
    await this.load();
    this.loadVerify();
    this._socketSub = this.socketService.auditAppended$.subscribe(() => this.scheduleRefresh());
  }

  async loadVerify() {
    try {
      const data: any = await this.apiService.auditVerify();
      if (!data || !data.chain) {
        this.verifyState.set({ ok: true, anchored: false, loading: false });
        return;
      }
      const ok = !!data.chain.ok;
      const anchored = !!(data.anchor && data.anchorMatchesChain);
      this.verifyState.set({
        ok,
        anchored,
        untilBlock: data.anchor?.untilBlock,
        brokenAt:   data.chain?.brokenAtId,
        loading:    false,
      });
    } catch {
      this.verifyState.set({ ok: true, anchored: false, loading: false });
    }
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = null;
  }

  private scheduleRefresh() {
    if (this._refreshTimer) return;
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      this.load();
    }, 500);
  }

  protected buildFilters() {
    return {
      from: this.filterFrom() || undefined,
      to: this.filterTo() || undefined,
      category: this.filterCategory() || undefined,
      action: this.filterAction() || undefined,
      page: this.page(),
      pageSize: this.pageSize,
    };
  }

  protected fetch() {
    return this.apiService.auditMe(this.buildFilters());
  }

  async load() {
    this.loadingService.show('Loading audit log...');
    const data = await this.fetch();
    if (data) {
      const rows = (data.rows || []).map((r: any) => this.mapRow(r));
      this.rows.set(rows);
      this.total.set(data.total ?? 0);
    } else {
      this.rows.set([]);
      this.total.set(0);
    }
    this.loadingService.hide();
  }

  protected mapRow(r: any): AuditLog {
    // Tolerate either snake_case or camelCase in the API payload.
    const pick = (...keys: string[]): any => {
      for (const k of keys) if (r?.[k] !== undefined && r?.[k] !== null) return r[k];
      return undefined;
    };
    const rawExtras = pick('extras');
    return new AuditLog(
      pick('id') ?? 0,
      pick('category') ?? '',
      pick('action') ?? '',
      pick('actor_address', 'actorAddress') ?? '',
      pick('actor_user_id', 'actorUserId') ?? null,
      pick('actor_user_name', 'actorUserName') ?? '',
      pick('target_address', 'targetAddress') ?? '',
      pick('target_kind', 'targetKind') ?? '',
      pick('subject_id', 'subjectId') ?? '',
      pick('ref_no', 'refNo') ?? '',
      pick('before_state', 'beforeState') ?? '',
      pick('after_state', 'afterState') ?? '',
      pick('reason') ?? '',
      typeof rawExtras === 'string' ? rawExtras : JSON.stringify(rawExtras ?? {}),
      pick('visibility') ?? 0,
      pick('encrypted') ?? 0,
      pick('tx_hash', 'txHash') ?? '',
      pick('block_number', 'blockNumber') ?? 0,
      pick('log_index', 'logIndex') ?? 0,
      pick('chain_time', 'chainTime') ?? 0,
      pick('client_ip', 'clientIp') ?? '',
      pick('created_at', 'createdAt') ?? 0,
    );
  }

  applyFilters() {
    this.page.set(1);
    this.load();
  }

  clearFilters() {
    this.filterFrom.set('');
    this.filterTo.set('');
    this.filterCategory.set('');
    this.filterAction.set('');
    this.applyFilters();
  }

  nextPage() {
    if (this.page() < this.totalPages()) { this.page.set(this.page() + 1); this.load(); }
  }
  prevPage() {
    if (this.page() > 1) { this.page.set(this.page() - 1); this.load(); }
  }

  shortAddr(addr: string): string {
    if (!addr) return '';
    if (addr.length <= 12) return addr;
    return addr.slice(0, 6) + '…' + addr.slice(-4);
  }

  actorLabel(r: AuditLog): string {
    return r.actor_user_name || this.shortAddr(r.actor_address);
  }

  targetLabel(r: AuditLog): string {
    const kind = r.target_kind || '';
    const addr = this.shortAddr(r.target_address);
    if (kind && addr) return `${kind} · ${addr}`;
    return kind || addr || '';
  }

  openDetails(r: AuditLog) {
    this.router.navigate(['/authorized/logs/details', r.id], { queryParams: { refNo: r.ref_no } });
  }

  isZeroRef(refNo: string): boolean {
    return !refNo || /^0x0+$/i.test(refNo);
  }

  exportExcel() {
    const rows = this.rows().map(r => ({
      'Time': this.utils.formatDate(r.chain_time || r.created_at),
      'Category': r.category,
      'Action': r.action,
      'Actor': this.actorLabel(r),
      'Target Kind': r.target_kind,
      'Target': r.target_address,
      'RefNo': r.ref_no,
      'Reason': r.reason,
      'TxHash': r.tx_hash,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `${this.exportName()}_${stamp}.xlsx`);
  }

  exportPdf() {
    const rows = this.rows();
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(this.exportTitle(), 14, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${this.utils.formatDate(Math.floor(Date.now() / 1000))}`, 14, 21);
    autoTable(doc, {
      startY: 26,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [['Time', 'Category', 'Action', 'Actor', 'Target', 'RefNo', 'Reason']],
      body: rows.map(r => [
        this.utils.formatDate(r.chain_time || r.created_at),
        r.category, r.action,
        this.actorLabel(r),
        this.targetLabel(r),
        this.shortAddr(r.ref_no),
        (r.reason || '').slice(0, 60),
      ]),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`${this.exportName()}_${stamp}.pdf`);
  }

  protected exportName(): string { return 'audit_my'; }
  protected exportTitle(): string { return 'My Audit Activity'; }
  protected pageTitle(): string { return 'My Activity'; }

  get title(): string { return this.pageTitle(); }
}
