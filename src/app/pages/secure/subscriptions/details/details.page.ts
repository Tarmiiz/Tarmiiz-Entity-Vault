import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { Subscription as RxSubscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { ApiService } from '../../../../shared/services/api.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { AssetTransaction, Subscription, SubscriptionHolding } from '../../../../shared/models/data.model';
import { ModalSubscriptionStateService } from '../modals/modal-subscription-state/modal-subscription-state.service';
import { ModalSubscriptionStateComponent } from "../modals/modal-subscription-state/modal-subscription-state.component";
import { ModalTransactionInfoService } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.component';
import { SocketService } from '../../../../shared/services/socket.service';



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
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private subscriptionStateService = inject(ModalSubscriptionStateService);
  trxInfoService = inject(ModalTransactionInfoService);
  utils = inject(UtilsService);
  private socketService = inject(SocketService);

  private _socketSub: RxSubscription | null = null;

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
    await this.reload();
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.reload());
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  private async reload() {
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

  private readonly stateNames: Record<number, string> = {
    0: 'Inactive', 1: 'Initiated', 2: 'Active', 3: 'Suspended', 4: 'Deactivated',
  };

  private mapVaultSubscription(raw: any): Subscription {
    return {
      subscription: raw.address,
      entity: raw.entity ?? '',
      entityName: raw.entity_name ?? '',
      service: raw.service ?? '',
      serviceName: raw.service_name ?? raw.service ?? '',
      validator: raw.validator ?? '',
      validatorName: raw.validator_name ?? '',
      validatorVerificationId: raw.validator_level ?? 0,
      validatorTimestamp: raw.validator_trx_ts ?? 0,
      regulator: raw.regulator ?? '',
      regulatorName: raw.regulator_name ?? '',
      createdAt: raw.created_at ?? 0,
      suspended: raw.suspended === true || raw.suspended === 1,
      state: raw.state ?? 0,
      stateName: raw.account_state_name ?? this.stateNames[raw.state] ?? String(raw.state ?? ''),
    } as Subscription;
  }

  private mapVaultHolding(raw: any): SubscriptionHolding {
    return {
      asset: raw.asset ?? '',
      assetName: raw.asset_name ?? '',
      assetSymbol: raw.asset_symbol ?? '',
      balance: raw.balance ?? 0,
      cost: raw.cost ?? 0,
      currentBid: raw.current_bid ?? 0,
    } as SubscriptionHolding;
  }

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

  async getSubscriptionDetails() {
    this.loadingService.show('Loading data...');
    const raw = await this.apiService.vaultGetSubscription(this.subscriptionAddress);
    if (raw) this.subscription.set(this.mapVaultSubscription(raw));
    const didHash = await this.apiService.vaultGetSubscriptionIdentityHash(this.subscriptionAddress);
    if (didHash) this.didHash = didHash;
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
            const result = await this.apiService.vaultUpdateSubscriptionState(currentService.subscription, newState);
            if (result) {
                this.subscription.update(sub => sub ? {
                    ...sub,
                    state: newState,
                    stateName: this.stateNames[newState] ?? String(newState),
                } : sub);
            }
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
    const data = await this.apiService.vaultGetSubscriptionHoldings(this.subscriptionAddress, start - 1, offset);
    if (data?.holdings) this.holdings.set(data.holdings.map((h: any) => this.mapVaultHolding(h)));
    this.holdingPage.set(0);
    this.loadingService.hide();
  }

  async gotoAsset(asset: string) {
    this.router.navigate(['/authorized/assets/details/' + asset]);
  }

  async getTransactions(start: number, offset: number) {
    this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetTransactions({ subscription: this.subscriptionAddress }, start - 1, offset);
    if (data?.transactions) this.transactions.set(data.transactions.map((t: any) => this.mapVaultTransaction(t)));
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
