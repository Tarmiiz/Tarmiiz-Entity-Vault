import { Component, OnInit, signal, inject, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { Subscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";
import { ApiService } from '../../../../shared/services/api.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { ModalTransactionInfoService } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.component';
import { AuditService } from '../../../../shared/services/audit.service';
import { AssetTransaction } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    ModalTransactionInfoComponent,
  ]
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private socketService = inject(SocketService);
  utils = inject(UtilsService);
  private loadingService = inject(LoadingService);
  private modalTransactionInfoService = inject(ModalTransactionInfoService);
  private auditService = inject(AuditService);

  transactions = signal<AssetTransaction[]>([]);
  totalCount = signal<number>(0);

  page = signal(0);
  readonly trxPageSize = 20;

  filterType = signal<string>('');
  filterAsset = signal<string>('');
  filterService = signal<string>('');
  filterSubscription = signal<string>('');
  filterStartDate = signal<string>('');
  filterEndDate = signal<string>('');
  filterCurrency = signal<string>('');

  uniqueAssets = computed(() =>
    [...new Map(this.transactions().map(t => [t.asset, `${t.assetName} (${t.assetSymbol})`])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  uniqueServices = computed(() =>
    [...new Map(this.transactions().map(t => [t.service, t.serviceName])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  uniqueSubscriptions = computed(() =>
    [...new Set(this.transactions().filter(t => t.subscription).map(t => t.subscription))]
      .sort()
  );

  uniqueCurrencies = computed(() =>
    [...new Set(this.transactions().map(t => t.currencyCode).filter(Boolean))].sort()
  );

  pagedTransactions = computed(() => {
    const p = this.page();
    return this.filteredTransactions().slice(p * this.trxPageSize, (p + 1) * this.trxPageSize);
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredTransactions().length / this.trxPageSize)));

  filteredTransactions = computed(() => {
    const type = this.filterType();
    const asset = this.filterAsset();
    const service = this.filterService();
    const subscription = this.filterSubscription();
    const currency = this.filterCurrency();
    const startTs = this.filterStartDate() ? Math.floor(new Date(this.filterStartDate()).getTime() / 1000) : 0;
    const endTs   = this.filterEndDate()   ? Math.floor(new Date(this.filterEndDate()).getTime()   / 1000) + 86399 : Infinity;
    return this.transactions().filter(t =>
      (!type || t.trxType === type) &&
      (!asset || t.asset === asset) &&
      (!service || t.service === service) &&
      (!subscription || t.subscription === subscription) &&
      (!currency || t.currencyCode === currency) &&
      t.time >= startTs && t.time <= endTs
    );
  });

  private mapVaultTransaction(raw: any): AssetTransaction {
    let trxRefNo = '';
    if (raw.data && typeof raw.data === 'object') { trxRefNo = raw.data.trxRefNo || ''; }
    return {
      trxId: raw.id,
      serviceTrxId: raw.service_trx_id ?? 0,
      trxType: raw.type ? (raw.type.charAt(0).toUpperCase() + raw.type.slice(1)) : 'Transfer',
      sender: raw.sender ?? '',
      manager: raw.manager ?? '',
      managerName: raw.manager_name ?? raw.manager ?? '',
      service: raw.service ?? '',
      serviceName: raw.service_name ?? raw.service ?? '',
      asset: raw.asset ?? '',
      assetName: raw.asset_name ?? raw.asset ?? '',
      assetSymbol: raw.asset_symbol ?? '',
      currencyCode: raw.currency_code ?? '',
      from: raw.from_addr ?? '',
      to: raw.to_addr ?? '',
      subscription: raw.subscription ?? '',
      tokens: raw.tokens ?? 0,
      price: raw.price ?? 0,
      totalPrice: raw.total ?? 0,
      data: typeof raw.data === 'string' ? raw.data : JSON.stringify(raw.data ?? {}),
      trxRefNo,
      time: raw.time ?? 0,
    } as AssetTransaction;
  }

  private _socketSub: Subscription | null = null;

  constructor() {
    effect(() => {
      this.filteredTransactions();
      this.page.set(0);
    });
  }

  async ngOnInit() {}

  async ionViewDidEnter() {
    await this.load();
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.load());
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  async load() {
    this.loadingService.show('Loading transactions...');
    const result = await this.apiService.vaultGetTransactions(undefined, 0, 500);
    if (result) {
      this.transactions.set(result.transactions.map((t: any) => this.mapVaultTransaction(t)));
      this.totalCount.set(result.count);
    }
    this.loadingService.hide();
  }

  clearFilters() {
    this.filterType.set('');
    this.filterAsset.set('');
    this.filterService.set('');
    this.filterSubscription.set('');
    this.filterCurrency.set('');
    this.filterStartDate.set('');
    this.filterEndDate.set('');
  }

  exportPdf() {
    const txs = this.filteredTransactions();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    // ── title ─────────────────────────────────────────────────────
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Transactions', pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${this.utils.formatDate(Math.floor(Date.now() / 1000))}`, pad, 21);

    // ── filters line ──────────────────────────────────────────────
    const assetLabel = this.filterAsset()
      ? (this.uniqueAssets().find(a => a[0] === this.filterAsset())?.[1] ?? this.filterAsset())
      : 'None';
    const serviceLabel = this.filterService()
      ? (this.uniqueServices().find(s => s[0] === this.filterService())?.[1] ?? this.filterService())
      : 'None';
    const filterParts = [
      `Type: ${this.filterType() || 'None'}`,
      `Asset: ${assetLabel}`,
      `Service: ${serviceLabel}`,
      `Subscription: ${this.filterSubscription() || 'None'}`,
      `Currency: ${this.filterCurrency() || 'None'}`,
      `From: ${this.filterStartDate() || 'None'}`,
      `To: ${this.filterEndDate() || 'None'}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Filters: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    // ── summary table ─────────────────────────────────────────────
    const subs   = txs.filter(t => t.trxType === 'Subscribe');
    const redeem = txs.filter(t => t.trxType === 'Redeem');
    const sumTokens = (arr: typeof txs) => arr.reduce((s, t) => s + Number(t.tokens), 0);
    const sumTotal  = (arr: typeof txs) => arr.reduce((s, t) => s + Number(t.totalPrice), 0);

    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: {
        1: { halign: 'center' }, // Count
        2: { halign: 'center' }, // Assets
        3: { halign: 'center' }, // Subscriptions
        4: { halign: 'right'  }, // Tokens
        5: { halign: 'right'  }, // Value
      },
      head: [[
        { content: 'Type' },
        { content: 'Count',         styles: { halign: 'center' } },
        { content: 'Assets',        styles: { halign: 'center' } },
        { content: 'Subscriptions', styles: { halign: 'center' } },
        { content: 'Tokens',        styles: { halign: 'right'  } },
        { content: 'Value',         styles: { halign: 'right'  } },
      ]],
      body: [
        ['Subscribe', subs.length,   new Set(subs.map(t => t.asset)).size,   new Set(subs.map(t => t.subscription)).size,   this.utils.formatTokens(sumTokens(subs)),   this.utils.formatPrice(sumTotal(subs))],
        ['Redeem',    redeem.length,  new Set(redeem.map(t => t.asset)).size, new Set(redeem.map(t => t.subscription)).size, this.utils.formatTokens(sumTokens(redeem)), this.utils.formatPrice(sumTotal(redeem))],
      ],
    });

    // ── transactions table ────────────────────────────────────────
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: {
        0: { cellWidth: 10 },              // #
        6: { halign: 'center' },           // Currency
        7: { halign: 'right' },            // Tokens
        8: { halign: 'right' },            // Price
        9: { halign: 'right' },            // Total
      },
      head: [[
        { content: '#' },
        { content: 'Time' },
        { content: 'Type' },
        { content: 'Asset' },
        { content: 'Service' },
        { content: 'Subscription' },
        { content: 'Currency', styles: { halign: 'center' } },
        { content: 'Tokens',   styles: { halign: 'right'  } },
        { content: 'Price',    styles: { halign: 'right'  } },
        { content: 'Total',    styles: { halign: 'right'  } },
      ]],
      body: txs.map((t, i) => [
        i + 1,
        this.utils.formatDate(t.time),
        t.trxType,
        `${t.assetName} (${t.assetSymbol})`,
        t.serviceName,
        t.subscription,
        t.currencyCode,
        this.utils.formatTokens(t.tokens),
        this.utils.formatPrice(t.price),
        this.utils.formatPrice(t.totalPrice),
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`transactions_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'transactions');
  }

  exportExcel() {
    const rows = this.filteredTransactions().map(t => ({
      'Time': this.utils.formatDate(t.time),
      'Type': t.trxType,
      'Asset': `${t.assetName} (${t.assetSymbol})`,
      'Service': t.serviceName,
      'Subscription': t.subscription,
      'Tokens': t.tokens,
      'Currency': t.currencyCode,
      'Price': t.price,
      'Total': t.totalPrice,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

    const now = new Date();
    const stamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `transactions_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'transactions');
  }

  getTrxTypeClass(type: string): string {
    switch (type) {
      case 'Subscribe': return 'bg-green-100 text-green-800';
      case 'Redeem':    return 'bg-red-100 text-red-800';
      case 'Transfer':  return 'bg-blue-100 text-blue-800';
      default:          return 'bg-gray-100 text-gray-800';
    }
  }

  viewDetails(trx: AssetTransaction): void {
    this.modalTransactionInfoService.show(trx);
    this.auditService.logView('transaction', { trxId: trx.trxId, trxType: trx.trxType });
  }


}
