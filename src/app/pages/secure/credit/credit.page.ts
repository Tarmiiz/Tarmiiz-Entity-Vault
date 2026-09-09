import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { Subscription as RxSubscription } from 'rxjs';

import { HeaderComponent } from '../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../shared/components/live-indicator/live-indicator.component';
import { ModalRouteTransferComponent } from './modals/modal-route-transfer/modal-route-transfer.component';
import { ModalRouteTransferService } from './modals/modal-route-transfer/modal-route-transfer.service';

import { ApiService } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { FeaturesService } from '../../../shared/services/features.service';
import { SocketService } from '../../../shared/services/socket.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';
import { UtilsService } from '../../../shared/services/utils.service';
import { AuditService } from '../../../shared/services/audit.service';
import { applyPdfFooter } from '../../../shared/utils/pdf-export.utils';

import { CreditBalance } from '../../../shared/models/data.model';
import { PaginatorComponent, pageSlice } from '../../../shared/components/paginator/paginator.component';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';

interface CreditRow {
  subscription: string;
  service: string;
  serviceName: string;
  state: number;
  stateName: string;
  suspended: boolean;
  balances: CreditBalance[];
}

/** A service's position in one currency — the POOL it holds and the CLAIMS on it (Reading B). */
interface ServicePool {
  service: string;
  serviceName: string;
  currencyCode: number;
  currencyName: string;
  currencySymbol: string;
  pool: number;
  claims: number;
}

@Component({
  selector: 'app-credit',
  templateUrl: './credit.page.html',
  styleUrls: ['./credit.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, LiveIndicatorComponent, TranslatePipe, ModalRouteTransferComponent, PaginatorComponent, MoneyPipe],
})
export class CreditPage implements OnInit {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private socketService = inject(SocketService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private translate = inject(TranslateService);
  utils = inject(UtilsService);
  features = inject(FeaturesService);
  private auditService = inject(AuditService);
  routeTransferModal = inject(ModalRouteTransferService);

  loading = signal(false);
  refreshing = signal(false);

  totals = signal<CreditBalance[]>([]);
  rows = signal<CreditRow[]>([]);
  /*
      The OTHER half of Reading B (2026-09-09). A subscriber holds a CLAIM on its service's POOL;
      the two are different numbers and this page used to show only the first. Measured on
      granite: every subscriber's claim was genuinely 0 — each deposit was spent at once through
      deposit-buy — while the service's pool held 565,000 EGP, and the page said "No credit
      balances" with no currency column at all. The pools are shown beside the claims, and a
      currency the service HOLDS a pool in gets a column even when every claim on it is 0.00.
  */
  pools = signal<ServicePool[]>([]);

  searchSubscription = signal<string>('');
  searchService = signal<string>('');
  filterCurrency = signal<string>('');
  filterBalanceOp = signal<'' | 'gt' | 'lt'>('');
  filterBalanceAmt = signal<number | null>(null);

  activeTotals = computed(() => this.totals().filter(t => t.balance !== 0));
  activePools  = computed(() => this.pools().filter(p => p.pool !== 0 || p.claims !== 0));

  /** Currencies that earn a column: any non-zero claim or hold on any row, or any service pool. */
  uniqueCurrencies = computed(() => {
    const live = new Set<number>();
    for (const t of this.totals()) if (t.balance !== 0 || t.withheld !== 0) live.add(t.currencyCode);
    for (const r of this.rows()) for (const b of r.balances) if (b.balance !== 0 || b.withheld !== 0) live.add(b.currencyCode);
    for (const p of this.pools()) if (p.pool !== 0 || p.claims !== 0) live.add(p.currencyCode);

    const map = new Map<number, CreditBalance>();
    for (const t of this.totals()) if (live.has(t.currencyCode)) map.set(t.currencyCode, t);
    for (const r of this.rows()) for (const b of r.balances) if (live.has(b.currencyCode) && !map.has(b.currencyCode)) map.set(b.currencyCode, b);
    for (const p of this.pools()) if (live.has(p.currencyCode) && !map.has(p.currencyCode)) {
      map.set(p.currencyCode, new CreditBalance(p.currencyCode, p.currencyName, p.currencySymbol, 0, 0, 0));
    }
    return [...map.values()].sort((a, b) => a.currencyCode - b.currencyCode);
  });

  /** 1-based, per frontend Standard 1.5. */
  rowsPage = signal(1);
  rowsPageSize = signal(25);
  pagedRows = computed(() => pageSlice(this.filteredRows(), this.rowsPage(), this.rowsPageSize()));
  filteredRows = computed(() => {
    const subQ = this.searchSubscription().toLowerCase();
    const svcQ = this.searchService().toLowerCase();
    const cc = this.filterCurrency();
    const op = this.filterBalanceOp();
    const amt = this.filterBalanceAmt();
    const ccNum = cc ? Number(cc) : null;

    return this.rows().filter(r => {
      if (subQ) {
        if (!r.subscription.toLowerCase().includes(subQ)) return false;
      }
      if (svcQ) {
        const hay = `${r.serviceName} ${r.service}`.toLowerCase();
        if (!hay.includes(svcQ)) return false;
      }
      if (ccNum !== null) {
        const b = r.balances.find(x => x.currencyCode === ccNum);
        if (!b) return false;
        if (op && amt !== null) {
          if (op === 'gt' && b.balance <= amt) return false;
          if (op === 'lt' && b.balance >= amt) return false;
        }
      } else if (op && amt !== null) {
        const total = r.balances.reduce((a, b) => a + b.balance, 0);
        if (op === 'gt' && total <= amt) return false;
        if (op === 'lt' && total >= amt) return false;
      }
      return true;
    });
  });

  private _socketSub: RxSubscription | null = null;

  ngOnInit() {}

  async ionViewDidEnter() {
    await this.load();
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.load(true));
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  async load(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) {
      this.loading.set(true);
      this.loadingService.show(this.translate.instant('credit.loadingOverview'));
    }
    try {
      const data = await this.apiService.vaultGetEntityCreditOverview();
      if (data) {
        this.totals.set((data.totals || []).map((t: any) => ({
          currencyCode: t.currencyCode,
          currencyName: t.currencyName,
          currencySymbol: t.currencySymbol,
          balance: Number(t.balance) || 0,
          withheld: Number(t.withheld) || 0,
          available: Number(t.available) || 0,
        })));
        this.pools.set((data.pools || []).map((p: any) => ({
          service: p.service,
          serviceName: p.serviceName || p.service,
          currencyCode: p.currencyCode,
          currencyName: p.currencyName,
          currencySymbol: p.currencySymbol,
          pool: Number(p.pool) || 0,
          claims: Number(p.claims) || 0,
        })));
        this.rows.set((data.subscriptions || []).map((r: any) => ({
          subscription: r.subscription,
          service: r.service,
          serviceName: r.serviceName || r.service,
          state: r.state ?? 0,
          stateName: r.stateName || '',
          suspended: !!r.suspended,
          balances: (r.balances || []).map((b: any) => ({
            currencyCode: b.currencyCode,
            currencyName: b.currencyName,
            currencySymbol: b.currencySymbol,
            balance: Number(b.balance) || 0,
          })),
        })));
      }
    } finally {
      if (!silent) {
        this.loadingService.hide();
        this.loading.set(false);
      }
      if (silent) this.refreshing.set(false);
    }
  }

  balanceFor(row: CreditRow, currencyCode: number): number | null {
    const b = row.balances.find(x => x.currencyCode === currencyCode);
    return b ? b.balance : null;
  }

  getStateClass(stateId: number | undefined): string {
    if (stateId === undefined) return 'bg-gray-100 text-gray-800';
    switch (stateId) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  clearFilters() {
    this.searchSubscription.set('');
    this.searchService.set('');
    this.filterCurrency.set('');
    this.filterBalanceOp.set('');
    this.filterBalanceAmt.set(null);
    this.rowsPage.set(1);
  }

  viewSubscription(address: string) {
    this.router.navigate(['/authorized/subscriptions/details/' + address]);
  }


  async openRouteTransfer() {
    const r = await this.routeTransferModal.show({ currencies: this.uniqueCurrencies() });
    if (r?.ok) await this.load(true);
  }

  exportExcel() {
    const currencies = this.uniqueCurrencies();
    const rows = this.filteredRows().map((r, i) => {
      const base: any = {
        '#': i + 1,
        'Subscription': r.subscription,
        'Service': r.serviceName,
        'State': r.stateName,
      };
      for (const c of currencies) {
        const b = r.balances.find(x => x.currencyCode === c.currencyCode);
        base[`${c.currencySymbol}`] = b ? b.balance : 0;
      }
      return base;
    });

    const totalsRows = this.activeTotals().map(t => ({
      'Currency': `${t.currencyName} (${t.currencySymbol})`,
      'Total': t.balance,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(totalsRows), 'Totals');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Subscriptions');

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `entity_credit_overview_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'entity_credit_overview');
  }

  exportPdf() {
    const currencies = this.uniqueCurrencies();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Entity Credit Overview', pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    autoTable(doc, {
      startY: 28,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: { 1: { halign: 'right' } },
      head: [[
        { content: 'Currency' },
        { content: 'Total Balance', styles: { halign: 'right' } },
      ]],
      body: this.activeTotals().map(t => [
        `${t.currencyName} (${t.currencySymbol})`,
        this.utils.formatPrice(t.balance),
      ]),
    });

    const head: any[] = [
      { content: '#' },
      { content: 'Subscription' },
      { content: 'Service' },
      { content: 'State' },
    ];
    for (const c of currencies) head.push({ content: c.currencySymbol, styles: { halign: 'right' } });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: { 0: { cellWidth: 10 } },
      head: [head],
      body: this.filteredRows().map((r, i) => {
        const row: any[] = [
          i + 1,
          r.subscription,
          r.serviceName,
          r.stateName,
        ];
        for (const c of currencies) {
          const b = r.balances.find(x => x.currencyCode === c.currencyCode);
          row.push({ content: b ? this.utils.formatPrice(b.balance) : '—', styles: { halign: 'right' } });
        }
        return row;
      }),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`entity_credit_overview_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'entity_credit_overview');
  }
}
