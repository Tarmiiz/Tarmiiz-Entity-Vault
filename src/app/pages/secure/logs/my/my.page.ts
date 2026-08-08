import { Component, OnInit, signal, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../../shared/components/live-indicator/live-indicator.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { applyPdfFooter } from '../../../../shared/utils/pdf-export.utils';
import { AuditLog } from '../../../../shared/models/data.model';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';

// Full taxonomy — keep in sync with the API's services/audit.js AUDIT_CATEGORIES.
const AUDIT_CATEGORIES = [
  'User', 'Role', 'Auth', 'State', 'Config', 'Document', 'Entity',
  'Service', 'Subscription', 'Asset', 'Credit', 'DEX', 'Identity',
  'Regulator', 'Validator', 'Payment Processor', 'Connect', 'SignerKey',
  'Directory', 'Validator Endorsement', 'Payment Processor Endorsement',
  'Custodian', 'Custodian Endorsement', 'Data Provider',
  'Data Provider Endorsement', 'Currency', 'Distribution', 'ServiceProvider'
];

@Component({
  selector: 'app-logs-my',
  templateUrl: './my.page.html',
  styleUrls: ['./my.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, HeaderComponent, LiveIndicatorComponent, TranslatePipe, PaginatorComponent]
})
export class MyPage implements OnInit {
  protected apiService = inject(ApiService);
  protected authService = inject(AuthService);
  protected socketService = inject(SocketService);
  protected loadingService = inject(LoadingService);
  protected router = inject(Router);
  protected activatedRoute = inject(ActivatedRoute);
  protected translate = inject(TranslateService);
  utils = inject(UtilsService);

  readonly categories = AUDIT_CATEGORIES;

  rows = signal<AuditLog[]>([]);
  total = signal(0);
  refreshing = signal(false);
  page = signal(1);
  pageSize = signal(25);

  filterFrom = signal<string>('');
  filterTo = signal<string>('');
  filterCategory = signal<string>('');
  filterAction = signal<string>('');
  filterActor = signal<string>('');
  filterContract = signal<string>('');
  filterRefNo = signal<string>('');

  // Tamper-evidence banner state (GET /audit/verify)
  verifyState = signal<{ ok: boolean; anchored: boolean; untilBlock?: number; brokenAt?: number; loading: boolean }>({ ok: true, anchored: false, loading: true });

  uniqueActions = computed(() => [...new Set(this.rows().map(r => r.action).filter(Boolean))].sort());

  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  private _socketSub: Subscription | null = null;
  private _refreshTimer: any = null;

  async ngOnInit() {}

  async ionViewDidEnter() {
    const qp = this.activatedRoute.snapshot.queryParamMap;
    const actor    = qp.get('actor')    || '';
    const contract = qp.get('contract') || '';
    const refNo    = qp.get('refNo')    || '';
    if (actor)    this.filterActor.set(actor);
    if (contract) this.filterContract.set(contract);
    if (refNo)    this.filterRefNo.set(refNo);
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
      this.load(true);
    }, 500);
  }

  protected buildFilters(page: number = this.page(), pageSize: number = this.pageSize()) {
    return {
      from: this.filterFrom() || undefined,
      to: this.filterTo() || undefined,
      category: this.filterCategory() || undefined,
      action: this.filterAction() || undefined,
      actor: this.filterActor() || undefined,
      contract: this.filterContract() || undefined,
      refNo: this.filterRefNo() || undefined,
      page,
      pageSize,
    };
  }

  protected fetch(page?: number, pageSize?: number) {
    return this.apiService.auditMe(this.buildFilters(page, pageSize));
  }

  // Fetch EVERY row matching the current filters for export (the table itself
  // stays paged) — 500-row chunks fit under the API's pageSize cap; the hard
  // cap keeps a runaway filterless export bounded.
  protected async loadAllForExport(): Promise<AuditLog[]> {
    const CHUNK = 500;
    const HARD_CAP = 20000;
    const all: AuditLog[] = [];
    this.loadingService.show(this.translate.instant('common.preparingExport'));
    try {
      let page = 1;
      while (all.length < HARD_CAP) {
        const data = await this.fetch(page, CHUNK);
        const rows = (data?.rows || []).map((r: any) => this.mapRow(r));
        all.push(...rows);
        const total = Number(data?.total ?? 0);
        if (rows.length === 0 || all.length >= total) break;
        page++;
      }
    } finally {
      this.loadingService.hide();
    }
    return all;
  }

  async load(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show(this.translate.instant('logs.audit.loadingLog'));
    try {
      const data = await this.fetch();
      if (data) {
        const rows = (data.rows || []).map((r: any) => this.mapRow(r));
        this.rows.set(rows);
        this.total.set(data.total ?? 0);
      } else {
        this.rows.set([]);
        this.total.set(0);
      }
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  protected mapRow(r: any): AuditLog {
    // Tolerate either snake_case or camelCase in the API payload.
    const pick = (...keys: string[]): any => {
      for (const k of keys) if (r?.[k] !== undefined && r?.[k] !== null) return r[k];
      return undefined;
    };
    return new AuditLog(
      pick('id') ?? 0,
      pick('category') ?? '',
      pick('action') ?? '',
      pick('actor_address', 'actorAddress') ?? '',
      pick('actor_user_id', 'actorUserId') ?? null,
      pick('actor_user_address', 'actorUserAddress') ?? null,
      pick('country_code', 'countryCode') ?? 0,
      pick('function_selector', 'functionSelector') ?? null,
      pick('contract') ?? null,
      pick('ref_no', 'refNo') ?? '',
      pick('tx_hash', 'txHash') ?? '',
      pick('block_number', 'blockNumber') ?? 0,
      pick('log_index', 'logIndex') ?? 0,
      pick('chain_time', 'chainTime') ?? 0,
      pick('client_ip', 'clientIp') ?? null,
      pick('created_at', 'createdAt') ?? 0,
      pick('actor_name', 'actorName') ?? null,
      pick('actor_kind', 'actorKind') ?? null,
      pick('actor_user_name', 'actorUserName') ?? null,
      pick('function_name', 'functionName') ?? null,
      pick('function_signature', 'functionSignature') ?? null,
      pick('contract_name', 'contractName') ?? null,
      pick('contract_kind', 'contractKind') ?? null,
      pick('action_label', 'actionLabel') ?? null,
      pick('prev_hash', 'prevHash') ?? null,
      pick('row_hash', 'rowHash') ?? null,
      pick('verified') ?? null,
      pick('time') ?? 0,
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
    this.filterActor.set('');
    this.filterContract.set('');
    this.filterRefNo.set('');
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

  shortAddr(addr: string | null | undefined, head = 6, tail = 4): string {
    return this.utils.shortAddr(addr, head, tail);
  }

  actorLabel(r: AuditLog): string {
    if (r.actor_name) {
      return r.actor_kind ? `${r.actor_name} · ${r.actor_kind}` : r.actor_name;
    }
    return r.actor_user_name || r.actor_address || '';
  }

  functionLabel(r: AuditLog): string {
    if (r.function_name) return r.function_name;
    return r.function_selector ? this.shortAddr(r.function_selector) : '';
  }

  contractLabel(r: AuditLog): string {
    if (r.contract_name) return r.contract_name;
    return this.shortAddr(r.contract);
  }

  actionLabel(r: AuditLog): string {
    // Persisted drain-time readable label ("Credit – Service Deposit");
    // falls back to the raw decoded action for legacy rows.
    return r.action_label || (r.action || '').replace(/_/g, ' ');
  }

  userLabel(r: AuditLog): string {
    return r.actor_user_name || (r.actor_user_id ? this.shortAddr(r.actor_user_id) : '');
  }

  openDetails(r: AuditLog) {
    // Pass the full row via Router state so the details page can render
    // without re-fetching by id.
    this.router.navigate(
      ['/authorized/logs/details', r.id],
      { queryParams: { refNo: r.ref_no }, state: { row: r } }
    );
  }

  isZeroRef(refNo: string): boolean {
    return !refNo || /^0x0+$/i.test(refNo);
  }

  async exportExcel() {
    const timeLabel = this.translate.instant('logs.table.time');
    const categoryLabel = this.translate.instant('logs.table.category');
    const actionLabelHeader = this.translate.instant('logs.table.action');
    const functionLabel = this.translate.instant('logs.table.function');
    const actorLabelHeader = this.translate.instant('logs.table.actor');
    const userLabel = this.translate.instant('logs.table.user');
    const clientIpLabel = this.translate.instant('logs.table.clientIp');
    const contractLabel = this.translate.instant('logs.table.contract');
    const refNoLabel = this.translate.instant('logs.table.refNo');
    const txHashLabel = this.translate.instant('logs.details.txHash');
    const rows = (await this.loadAllForExport()).map(r => ({
      [timeLabel]: this.utils.formatTime(r.time),
      [categoryLabel]: r.category,
      [actionLabelHeader]: this.actionLabel(r),
      [functionLabel]: this.functionLabel(r),
      [actorLabelHeader]: this.actorLabel(r),
      [userLabel]: r.actor_user_name || '',
      [clientIpLabel]: r.client_ip || '',
      [contractLabel]: r.contract,
      [refNoLabel]: r.ref_no,
      [txHashLabel]: r.tx_hash,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, this.translate.instant('logs.audit.exportSheet'));
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `${this.exportName()}_${stamp}.xlsx`);
  }

  async exportPdf() {
    const rows = await this.loadAllForExport();
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(this.exportTitle(), 14, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: 26,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [[
        this.translate.instant('logs.table.time'),
        this.translate.instant('logs.table.category'),
        this.translate.instant('logs.table.action'),
        this.translate.instant('logs.table.function'),
        this.translate.instant('logs.table.actor'),
        this.translate.instant('logs.table.user'),
        this.translate.instant('logs.table.clientIp'),
        this.translate.instant('logs.table.contract'),
        this.translate.instant('logs.table.refNo'),
      ]],
      body: rows.map(r => [
        this.utils.formatTime(r.time),
        r.category, this.actionLabel(r),
        this.functionLabel(r),
        this.actorLabel(r),
        r.actor_user_name || '',
        r.client_ip || '',
        this.shortAddr(r.contract),
        this.shortAddr(r.ref_no),
      ]),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`${this.exportName()}_${stamp}.pdf`);
  }

  protected exportName(): string { return 'audit_my'; }
  protected exportTitle(): string { return this.translate.instant('logs.my.exportTitle'); }
  protected pageTitle(): string { return this.translate.instant('logs.my.pageTitle'); }

  get title(): string { return this.pageTitle(); }
}
