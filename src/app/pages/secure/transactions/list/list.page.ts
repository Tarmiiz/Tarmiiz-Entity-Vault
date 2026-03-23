import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { HeaderComponent } from "../../../../shared/components/header/header.component";
import { RpcService } from '../../../../shared/services/rpc.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { ModalTransactionInfoService } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.component';
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
export class ListPage implements OnInit, OnDestroy {
  private rpcService = inject(RpcService);
  utils = inject(UtilsService);
  private loadingService = inject(LoadingService);
  private modalTransactionInfoService = inject(ModalTransactionInfoService);

  transactions = signal<AssetTransaction[]>([]);
  totalCount = signal<number>(0);
  start = 1;
  pageSize = 20;

  private unsubscribeBlocks: (() => void) | null = null;

  filterType = signal<string>('');
  filterAsset = signal<string>('');
  filterService = signal<string>('');
  filterSubscription = signal<string>('');

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

  filteredTransactions = computed(() => {
    const type = this.filterType();
    const asset = this.filterAsset();
    const service = this.filterService();
    const subscription = this.filterSubscription();
    return this.transactions().filter(t =>
      (!type || t.trxType === type) &&
      (!asset || t.asset === asset) &&
      (!service || t.service === service) &&
      (!subscription || t.subscription === subscription)
    );
  });

  constructor() {}

  async ngOnInit() {}

  async ionViewDidEnter() {
    await this.load();
    this.unsubscribeBlocks = this.rpcService.listenToAssetTransactions(async () => {
      const result = await this.rpcService.assetTransactions(this.start, this.pageSize);
      if (result.result && result.result.count !== this.totalCount()) {
        this.transactions.set(result.result.transactions);
        this.totalCount.set(result.result.count);
      }
    });
  }

  ionViewWillLeave() {
    this.unsubscribeBlocks?.();
    this.unsubscribeBlocks = null;
  }

  ngOnDestroy() {
    this.unsubscribeBlocks?.();
  }

  async load() {
    this.loadingService.show('Loading transactions...');
    const result = await this.rpcService.assetTransactions(this.start, this.pageSize);
    if (result.result) {
      this.transactions.set(result.result.transactions);
      this.totalCount.set(result.result.count);
    }
    this.loadingService.hide();
  }

  clearFilters() {
    this.filterType.set('');
    this.filterAsset.set('');
    this.filterService.set('');
    this.filterSubscription.set('');
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
        6: { halign: 'right' },            // Tokens
        7: { halign: 'right' },            // Price
        8: { halign: 'right' },            // Total
      },
      head: [[
        { content: '#' },
        { content: 'Time' },
        { content: 'Type' },
        { content: 'Asset' },
        { content: 'Service' },
        { content: 'Subscription' },
        { content: 'Tokens', styles: { halign: 'right' } },
        { content: 'Price',  styles: { halign: 'right' } },
        { content: 'Total',  styles: { halign: 'right' } },
      ]],
      body: txs.map((t, i) => [
        i + 1,
        this.utils.formatDate(t.time),
        t.trxType,
        `${t.assetName} (${t.assetSymbol})`,
        t.serviceName,
        t.subscription,
        this.utils.formatTokens(t.tokens),
        this.utils.formatPrice(t.price),
        this.utils.formatPrice(t.totalPrice),
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`transactions_${stamp}.pdf`);
  }

  exportExcel() {
    const rows = this.filteredTransactions().map(t => ({
      'Time': this.utils.formatDate(t.time),
      'Type': t.trxType,
      'Asset': `${t.assetName} (${t.assetSymbol})`,
      'Service': t.serviceName,
      'Subscription': t.subscription,
      'Tokens': t.tokens,
      'Price': t.price,
      'Total': t.totalPrice,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

    const now = new Date();
    const stamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `transactions_${stamp}.xlsx`);
  }

  viewDetails(trx: AssetTransaction): void {
    this.modalTransactionInfoService.show(trx);
  }


}
