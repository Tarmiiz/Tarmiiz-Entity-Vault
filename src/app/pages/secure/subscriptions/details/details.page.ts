import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { AssetTransaction, Subscription, SubscriptionHolding } from '../../../../shared/models/data.model';
import { ModalSubscriptionStateService } from '../modals/modal-subscription-state/modal-subscription-state.service';
import { ModalSubscriptionStateComponent } from "../modals/modal-subscription-state/modal-subscription-state.component";
import { ModalTransactionInfoService } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.component';



@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    RouterLink,
    ModalSubscriptionStateComponent,
    ModalTransactionInfoComponent
]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private rpcService = inject(RpcService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private subscriptionStateService = inject(ModalSubscriptionStateService);
  trxInfoService = inject(ModalTransactionInfoService);
  utils = inject(UtilsService);

  activeTab = signal<'overview' | 'info' | 'holdings' | 'trxs'>('overview');

  loadingData: boolean = false;

  subscriptionAddress = '';
  subscription = signal<Subscription | undefined>(undefined);
  didHash = '';
  holdings = signal<SubscriptionHolding[]>([]);
  holdingPage = signal(0);
  readonly holdingPageSize = 10;

  // holdings filters
  filterHoldingAsset = signal<string>('');
  filterHoldingBalanceOp = signal<'' | 'gt' | 'lt'>('');
  filterHoldingBalanceAmt = signal<number | null>(null);

  uniqueHoldingAssets = computed(() =>
    [...new Map(this.holdings().map(h => [h.asset, `${h.assetName} (${h.assetSymbol})`])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  filteredHoldings = computed(() => {
    const asset = this.filterHoldingAsset();
    const op = this.filterHoldingBalanceOp();
    const amt = this.filterHoldingBalanceAmt();
    return this.holdings().filter(h => {
      if (asset && h.asset !== asset) return false;
      if (op && amt !== null) {
        if (op === 'gt' && h.balance <= amt) return false;
        if (op === 'lt' && h.balance >= amt) return false;
      }
      return true;
    });
  });

  pagedHoldings = computed(() => {
    const start = this.holdingPage() * this.holdingPageSize;
    return this.filteredHoldings().slice(start, start + this.holdingPageSize);
  });
  totalHoldingPages = computed(() => Math.ceil(this.filteredHoldings().length / this.holdingPageSize));

  transactions = signal<AssetTransaction[]>([]);
  trxPage = signal(0);
  readonly trxPageSize = 10;

  // filters
  filterType = signal<string>('');
  filterAsset = signal<string>('');
  filterTokensOp = signal<'' | 'gt' | 'lt'>('');
  filterTokensAmt = signal<number | null>(null);

  uniqueAssets = computed(() =>
    [...new Map(this.transactions().map(t => [t.asset, `${t.assetName} (${t.assetSymbol})`])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  filteredTransactions = computed(() => {
    const type = this.filterType();
    const asset = this.filterAsset();
    const op = this.filterTokensOp();
    const amt = this.filterTokensAmt();
    return this.transactions().filter(t => {
      if (type && t.trxType !== type) return false;
      if (asset && t.asset !== asset) return false;
      if (op && amt !== null) {
        if (op === 'gt' && t.tokens <= amt) return false;
        if (op === 'lt' && t.tokens >= amt) return false;
      }
      return true;
    });
  });

  pagedTransactions = computed(() => {
    const start = this.trxPage() * this.trxPageSize;
    return this.filteredTransactions().slice(start, start + this.trxPageSize);
  });
  totalTrxPages = computed(() => Math.ceil(this.filteredTransactions().length / this.trxPageSize));

  // overview computed signals
  totalPortfolioValue = computed(() => this.holdings().reduce((sum, h) => sum + h.balance * h.currentBid, 0));
  totalCostBasis = computed(() => this.holdings().reduce((sum, h) => sum + h.cost, 0));
  totalPL = computed(() => this.totalPortfolioValue() - this.totalCostBasis());
  totalPLPct = computed(() => {
    const cost = this.totalCostBasis();
    return cost > 0 ? (this.totalPL() / cost) * 100 : null;
  });
  subscribeCount = computed(() => this.transactions().filter(t => t.trxType === 'Subscribe').length);
  redeemCount = computed(() => this.transactions().filter(t => t.trxType === 'Redeem').length);
  lastTrx = computed(() => {
    const t = this.transactions();
    if (!t || t.length === 0) return null;
    return [...t].sort((a, b) => b.time - a.time)[0];
  });

  constructor() { 
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.subscriptionAddress = address;
    }    
  }

  async ngOnInit() {}
  
  async ionViewWillEnter() {
    this.activeTab.set('overview');
    await this.getSubscriptionDetails();
    await Promise.all([
      this.getHoldings(1, 50),
      this.getTransactions(1, 50),
    ]);
  }

  setTab(tab: 'overview' | 'info' | 'holdings' | 'trxs') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getSubscriptionDetails();
    if (tab === 'holdings') this.getHoldings(1, 50);
    if (tab === 'trxs') this.getTransactions(1, 50);
  }

  async getSubscriptionDetails() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.subscriptionInfo(this.subscriptionAddress);
    // console.log('service', data.result);
    if(data.result) this.subscription.set(data.result);
    const didInfo = await this.rpcService.subscriptionGetIdentityHash(this.subscriptionAddress);
    if(didInfo.result) this.didHash = didInfo.result;
    this.loadingService.hide();
  }

  getStateClass(stateId: number | undefined): string {
    if (stateId === undefined) return 'bg-gray-100 text-gray-800';
    switch(stateId) {
      case 1: return 'bg-yellow-100 text-yellow-800'; // Initiated
      case 2: return 'bg-green-100 text-green-800';   // Active
      case 3: return 'bg-orange-100 text-orange-800'; // Suspended
      case 4: return 'bg-red-100 text-red-800';       // Deactivated
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  
  async openChangeStateModal(){
    const currentService = this.subscription();
    if (!currentService) return;

    const newState = await this.subscriptionStateService.show(currentService.state);
    if (newState !== null && newState !== currentService.state) {
        this.loadingService.show('Changing state...');
        try {
            await this.rpcService.subscriptionChangeState(currentService.subscription, newState);
            await this.getSubscriptionDetails();
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
    }    
  }

  getTrxTypeClass(trxType: string): string {
    switch (trxType) {
      case 'Subscribe': return 'bg-green-100 text-green-800';
      case 'Redeem':    return 'bg-orange-100 text-orange-800';
      default:          return 'bg-gray-100 text-gray-800';
    }
  }

  async getHoldings(start: number, offset: number) {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.assetHoldingsBySubscription(this.subscriptionAddress, start, offset);
    if (data.result?.holdings) this.holdings.set(data.result.holdings);
    this.holdingPage.set(0);
    this.loadingService.hide();
  }

  async gotoAsset(asset: string) {
    this.router.navigate(['/authorized/assets/details/' + asset]);
  }

  async getTransactions(start: number, offset: number) {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.assetTransactionsByAccount(this.subscriptionAddress, start, offset);
    if (data.result?.transactions) this.transactions.set(data.result.transactions);
    this.trxPage.set(0);
    this.loadingService.hide();
  }

  async gotoIdentity(entity: string) {
    this.router.navigate(['/authorized/entities/details/' + entity]);
  }  

  async gotoEntity(entity: string) {
    this.router.navigate(['/authorized/entities/details/' + entity]);
  }  

  async gotoService(service: string) {
    this.router.navigate(['/authorized/services/details/' + service]);
  }

  clearHoldingFilters() {
    this.filterHoldingAsset.set('');
    this.filterHoldingBalanceOp.set('');
    this.filterHoldingBalanceAmt.set(null);
    this.holdingPage.set(0);
  }

  clearFilters() {
    this.filterType.set('');
    this.filterAsset.set('');
    this.filterTokensOp.set('');
    this.filterTokensAmt.set(null);
    this.trxPage.set(0);
  }

  exportPdf() {
    const txs = this.filteredTransactions();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    const sub = this.subscription();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Transactions - ${sub?.subscription ?? ''}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${this.utils.formatDate(Math.floor(Date.now() / 1000))}`, pad, 21);

    const tokensOp = this.filterTokensOp();
    const tokensAmt = this.filterTokensAmt();
    const tokensLabel = tokensOp && tokensAmt !== null
      ? `${tokensOp === 'gt' ? '>' : '<'} ${tokensAmt}`
      : 'None';
    const assetLabel = this.filterAsset()
      ? (this.uniqueAssets().find(a => a[0] === this.filterAsset())?.[1] ?? this.filterAsset())
      : 'None';
    const filterParts = [
      `Type: ${this.filterType() || 'None'}`,
      `Asset: ${assetLabel}`,
      `Tokens: ${tokensLabel}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Filters: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    const subs = txs.filter(t => t.trxType === 'Subscribe');
    const redeem = txs.filter(t => t.trxType === 'Redeem');
    const sumTokens = (arr: typeof txs) => arr.reduce((s, t) => s + Number(t.tokens), 0);
    const sumTotal = (arr: typeof txs) => arr.reduce((s, t) => s + Number(t.totalPrice), 0);

    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      head: [[
        { content: 'Type' },
        { content: 'Count', styles: { halign: 'center' } },
        { content: 'Assets', styles: { halign: 'center' } },
        { content: 'Tokens', styles: { halign: 'right' } },
        { content: 'Value', styles: { halign: 'right' } },
      ]],
      body: [
        ['Subscribe', subs.length, new Set(subs.map(t => t.asset)).size, this.utils.formatTokens(sumTokens(subs)), this.utils.formatPrice(sumTotal(subs))],
        ['Redeem', redeem.length, new Set(redeem.map(t => t.asset)).size, this.utils.formatTokens(sumTokens(redeem)), this.utils.formatPrice(sumTotal(redeem))],
      ],
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: {
        0: { cellWidth: 10 },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
      },
      head: [[
        { content: '#' },
        { content: 'Time' },
        { content: 'Type' },
        { content: 'Asset' },
        { content: 'Tokens', styles: { halign: 'right' } },
        { content: 'Price', styles: { halign: 'right' } },
        { content: 'Total', styles: { halign: 'right' } },
      ]],
      body: txs.map((t, i) => [
        i + 1,
        this.utils.formatDate(t.time),
        t.trxType,
        `${t.assetName} (${t.assetSymbol})`,
        this.utils.formatTokens(t.tokens),
        this.utils.formatPrice(t.price),
        this.utils.formatPrice(t.totalPrice),
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`subscription_transactions_${stamp}.pdf`);
  }

  exportHoldingsPdf() {
    const holdings = this.filteredHoldings();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    const sub = this.subscription();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Holdings - ${sub?.subscription ?? ''}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${this.utils.formatDate(Math.floor(Date.now() / 1000))}`, pad, 21);

    const holdingBalanceOp = this.filterHoldingBalanceOp();
    const holdingBalanceAmt = this.filterHoldingBalanceAmt();
    const holdingBalanceLabel = holdingBalanceOp && holdingBalanceAmt !== null
      ? `${holdingBalanceOp === 'gt' ? '>' : '<'} ${holdingBalanceAmt}`
      : 'None';
    const holdingAssetLabel = this.filterHoldingAsset()
      ? (this.uniqueHoldingAssets().find(a => a[0] === this.filterHoldingAsset())?.[1] ?? this.filterHoldingAsset())
      : 'None';
    const filterParts = [
      `Asset: ${holdingAssetLabel}`,
      `Balance: ${holdingBalanceLabel}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Filters: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
      head: [[
        { content: 'Asset' },
        { content: 'Balance', styles: { halign: 'right' } },
        { content: 'Cost', styles: { halign: 'right' } },
        { content: 'Value', styles: { halign: 'right' } },
        { content: 'P/L', styles: { halign: 'right' } },
        { content: 'P/L %', styles: { halign: 'right' } },
      ]],
      body: holdings.map(h => {
        const value = h.balance * h.currentBid;
        const pl = value - h.cost;
        const plPct = h.cost > 0 ? (pl / h.cost * 100).toFixed(2) + '%' : '—';
        return [
          `${h.assetName}${h.assetSymbol ? ` (${h.assetSymbol})` : ''}`,
          this.utils.formatTokens(h.balance),
          this.utils.formatPrice(h.cost),
          this.utils.formatPrice(value),
          this.utils.formatPrice(pl),
          plPct,
        ];
      }),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`subscription_holdings_${stamp}.pdf`);
  }

  exportHoldingsExcel() {
    const rows = this.filteredHoldings().map(h => {
      const value = h.balance * h.currentBid;
      const pl = value - h.cost;
      return {
        'Asset': `${h.assetName}${h.assetSymbol ? ` (${h.assetSymbol})` : ''}`,
        'Balance': h.balance,
        'Cost': h.cost,
        'Value': value,
        'P/L': pl,
        'P/L %': h.cost > 0 ? pl / h.cost * 100 : null,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Holdings');

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `subscription_holdings_${stamp}.xlsx`);
  }

  exportExcel() {
    const rows = this.filteredTransactions().map(t => ({
      'Time': this.utils.formatDate(t.time),
      'Type': t.trxType,
      'Asset': `${t.assetName} (${t.assetSymbol})`,
      'Tokens': t.tokens,
      'Price': t.price,
      'Total': t.totalPrice,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

    const now = new Date();
    const stamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `subscription_transactions_${stamp}.xlsx`);
  }

}
