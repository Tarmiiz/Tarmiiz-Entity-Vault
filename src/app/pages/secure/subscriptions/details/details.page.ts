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
import { AssetTransaction, CreditBalance, CreditTransaction, Subscription, SubscriptionHolding, User } from '../../../../shared/models/data.model';
import { AuthService } from '../../../../shared/services/auth.service';
import { applyPdfFooter } from '../../../../shared/utils/pdf-export.utils';
import { ModalSubscriptionStateService } from '../modals/modal-subscription-state/modal-subscription-state.service';
import { ModalSubscriptionStateComponent } from "../modals/modal-subscription-state/modal-subscription-state.component";
import { ModalTransactionInfoService } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.component';
import { ModalCreditTrxInfoService } from '../../../../shared/components/modal-credit-trx-info/modal-credit-trx-info.service';
import { ModalCreditTrxInfoComponent } from '../../../../shared/components/modal-credit-trx-info/modal-credit-trx-info.component';
import { ModalCreditDepositService } from '../modals/modal-credit-deposit/modal-credit-deposit.service';
import { ModalCreditDepositComponent } from '../modals/modal-credit-deposit/modal-credit-deposit.component';
import { SocketService } from '../../../../shared/services/socket.service';
import { AuditService } from '../../../../shared/services/audit.service';
import { DocumentsTabComponent } from '../../../../shared/components/documents-tab/documents-tab.component';
import { LiveIndicatorComponent } from '../../../../shared/components/live-indicator/live-indicator.component';



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
    ModalTransactionInfoComponent,
    ModalCreditTrxInfoComponent,
    ModalCreditDepositComponent,
    DocumentsTabComponent,
    LiveIndicatorComponent,
]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private subscriptionStateService = inject(ModalSubscriptionStateService);
  private creditDepositService = inject(ModalCreditDepositService);
  trxInfoService = inject(ModalTransactionInfoService);
  creditTrxInfoService = inject(ModalCreditTrxInfoService);
  utils = inject(UtilsService);
  private socketService = inject(SocketService);
  private authService = inject(AuthService);
  private auditService = inject(AuditService);

  userInfo!: User;
  get entityActive() { return this.authService.entityActive(); }
  private _socketSub: RxSubscription | null = null;

  activeTab = signal<'overview' | 'info' | 'holdings' | 'trxs' | 'credit' | 'docs'>('overview');

  loadingData: boolean = false;
  refreshing = signal(false);

  subscriptionAddress = '';
  subscription = signal<Subscription | undefined>(undefined);
  suspensionReason = signal<string>('');
  holdings = signal<SubscriptionHolding[]>([]);
  holdingPage = signal(0);
  readonly holdingPageSize = 10;

  // holdings filters
  filterHoldingAsset = signal<string>('');
  filterHoldingBalanceOp = signal<'' | 'gt' | 'lt'>('');
  filterHoldingBalanceAmt = signal<number | null>(null);
  filterHoldingCurrency = signal<string>('');

  uniqueHoldingAssets = computed(() =>
    [...new Map(this.holdings().map(h => [h.asset, `${h.assetName} (${h.assetSymbol})`])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  uniqueHoldingCurrencies = computed(() =>
    [...new Set(this.holdings().map(h => h.currencyCode).filter(Boolean))].sort()
  );

  filteredHoldings = computed(() => {
    const asset = this.filterHoldingAsset();
    const currency = this.filterHoldingCurrency();
    const op = this.filterHoldingBalanceOp();
    const amt = this.filterHoldingBalanceAmt();
    return this.holdings().filter(h => {
      if (asset && h.asset !== asset) return false;
      if (currency && h.currencyCode !== currency) return false;
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
  filterStartDate = signal<string>('');
  filterEndDate = signal<string>('');
  filterCurrency = signal<string>('');

  uniqueAssets = computed(() =>
    [...new Map(this.transactions().map(t => [t.asset, `${t.assetName} (${t.assetSymbol})`])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  uniqueCurrencies = computed(() =>
    [...new Set(this.transactions().map(t => t.currencyCode).filter(Boolean))].sort()
  );

  filteredTransactions = computed(() => {
    const type = this.filterType();
    const asset = this.filterAsset();
    const currency = this.filterCurrency();
    const op = this.filterTokensOp();
    const amt = this.filterTokensAmt();
    const startTs = this.filterStartDate() ? Math.floor(new Date(this.filterStartDate()).getTime() / 1000) : 0;
    const endTs   = this.filterEndDate()   ? Math.floor(new Date(this.filterEndDate()).getTime()   / 1000) + 86399 : Infinity;
    return this.transactions().filter(t => {
      if (type && t.trxType !== type) return false;
      if (asset && t.asset !== asset) return false;
      if (currency && t.currencyCode !== currency) return false;
      if (op && amt !== null) {
        if (op === 'gt' && t.tokens <= amt) return false;
        if (op === 'lt' && t.tokens >= amt) return false;
      }
      if (t.time < startTs || t.time > endTs) return false;
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

  holdingsByCurrency = computed(() => {
    const map = new Map<string, { marketValue: number; cost: number }>();
    for (const h of this.holdings()) {
      const cc = h.currencyCode || '—';
      const existing = map.get(cc) ?? { marketValue: 0, cost: 0 };
      map.set(cc, {
        marketValue: existing.marketValue + h.balance * h.currentBid,
        cost: existing.cost + h.cost,
      });
    }
    return [...map.entries()].map(([cc, v]) => ({
      currencyCode: cc,
      marketValue: v.marketValue,
      cost: v.cost,
      pl: v.marketValue - v.cost,
      plPct: v.cost > 0 ? (v.marketValue - v.cost) / v.cost * 100 : null,
    }));
  });
  subscribeCount = computed(() => this.transactions().filter(t => t.trxType === 'Subscribe').length);
  redeemCount = computed(() => this.transactions().filter(t => t.trxType === 'Redeem').length);
  lastTrx = computed(() => {
    const t = this.transactions();
    if (!t || t.length === 0) return null;
    return [...t].sort((a, b) => b.time - a.time)[0];
  });

  // credit tab state
  creditBalances = signal<CreditBalance[]>([]);
  creditTransactions = signal<CreditTransaction[]>([]);
  creditTrxPage = signal(0);
  readonly creditTrxPageSize = 10;

  filterCreditType = signal<string>('');
  filterCreditCurrency = signal<string>('');
  filterCreditAmountOp = signal<'' | 'gt' | 'lt'>('');
  filterCreditAmountVal = signal<number | null>(null);
  filterCreditStartDate = signal<string>('');
  filterCreditEndDate = signal<string>('');

  activeCreditBalances = computed(() => this.creditBalances().filter(b => b.balance > 0));

  uniqueCreditCurrencies = computed(() =>
    [...new Set(this.creditTransactions().map(t => t.currencySymbol).filter(Boolean))].sort()
  );

  filteredCreditTransactions = computed(() => {
    const type = this.filterCreditType();
    const currency = this.filterCreditCurrency();
    const op = this.filterCreditAmountOp();
    const amt = this.filterCreditAmountVal();
    const startTs = this.filterCreditStartDate() ? Math.floor(new Date(this.filterCreditStartDate()).getTime() / 1000) : 0;
    const endTs   = this.filterCreditEndDate()   ? Math.floor(new Date(this.filterCreditEndDate()).getTime()   / 1000) + 86399 : Infinity;
    return this.creditTransactions().filter(t => {
      if (type && t.trxTypeName !== type) return false;
      if (currency && t.currencySymbol !== currency) return false;
      if (op && amt !== null) {
        if (op === 'gt' && t.amount <= amt) return false;
        if (op === 'lt' && t.amount >= amt) return false;
      }
      if (t.startTime < startTs || t.startTime > endTs) return false;
      return true;
    });
  });

  pagedCreditTransactions = computed(() => {
    const start = this.creditTrxPage() * this.creditTrxPageSize;
    return this.filteredCreditTransactions().slice(start, start + this.creditTrxPageSize);
  });
  totalCreditTrxPages = computed(() => Math.ceil(this.filteredCreditTransactions().length / this.creditTrxPageSize));

  // change-highlight signals (cleared 2s after a silent refresh)
  newHoldingKeys      = signal<Set<string>>(new Set());
  newTrxIds           = signal<Set<number>>(new Set());
  newCreditTrxIds     = signal<Set<number>>(new Set());
  changedCreditCodes  = signal<Set<number>>(new Set());
  private flashHoldingKeys(keys: string[])   { if (!keys.length) return; this.newHoldingKeys.set(new Set(keys));     setTimeout(() => this.newHoldingKeys.set(new Set()),     2000); }
  private flashTrxIds(ids: number[])         { if (!ids.length)  return; this.newTrxIds.set(new Set(ids));           setTimeout(() => this.newTrxIds.set(new Set()),         2000); }
  private flashCreditTrxIds(ids: number[])   { if (!ids.length)  return; this.newCreditTrxIds.set(new Set(ids));     setTimeout(() => this.newCreditTrxIds.set(new Set()),   2000); }
  private flashCreditCodes(codes: number[])  { if (!codes.length) return; this.changedCreditCodes.set(new Set(codes)); setTimeout(() => this.changedCreditCodes.set(new Set()), 2000); }

  constructor() { 
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.subscriptionAddress = address;
    }    
  }

  async ngOnInit() {}
  
  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.activeTab.set('overview');
    await this.reload();
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.reload(true));
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  private async reload(silent = false) {
    if (silent) this.refreshing.set(true);
    try {
      await this.getSubscriptionDetails(silent);
      const tasks: Promise<any>[] = [
        this.getHoldings(1, 500, silent),
        this.getTransactions(1, 500, silent),
        this.getCreditBalances(silent),
      ];
      if (silent && this.activeTab() === 'credit') tasks.push(this.refreshCreditTransactions(silent));
      await Promise.all(tasks);
    } finally {
      if (silent) this.refreshing.set(false);
    }
  }

  private async refreshCreditTransactions(silent = false) {
    const trxData = await this.apiService.vaultGetSubscriptionCreditTransactions(this.subscriptionAddress, 1, 50);
    if (trxData?.transactions) {
      const mapped = trxData.transactions.map((t: any) => this.mapCreditTransaction(t));
      mapped.sort((a: CreditTransaction, b: CreditTransaction) => b.startTime - a.startTime);
      if (silent) {
        const prevIds = new Set(this.creditTransactions().map(t => t.trxId));
        this.flashCreditTrxIds(mapped.filter((t: CreditTransaction) => !prevIds.has(t.trxId)).map((t: CreditTransaction) => t.trxId));
      }
      this.creditTransactions.set(mapped);
    }
  }

  setTab(tab: 'overview' | 'info' | 'holdings' | 'trxs' | 'credit' | 'docs') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getSubscriptionDetails();
    if (tab === 'holdings') this.getHoldings(1, 500);
    if (tab === 'trxs') this.getTransactions(1, 500);
    if (tab === 'credit') this.getCreditData();
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
      validatorVerificationId: Number(raw.validator_trx_ref ?? 0),
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
    const balance  = Number(raw.balance ?? 0);
    const withheld = Number(raw.withheld ?? 0);
    return {
      asset: raw.asset ?? '',
      assetName: raw.asset_name ?? '',
      assetSymbol: raw.asset_symbol ?? '',
      currencyCode: raw.currency_code ?? '',
      balance,
      cost: raw.cost ?? 0,
      currentBid: raw.current_bid ?? 0,
      withheld,
      available: raw.available != null ? Number(raw.available) : balance - withheld,
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

  async getSubscriptionDetails(silent = false) {
    if (!silent) this.loadingService.show('Loading data...');
    const raw = await this.apiService.vaultGetSubscription(this.subscriptionAddress);
    if (raw) {
      const subscription = this.mapVaultSubscription(raw);
      this.subscription.set(subscription);
      if (subscription.suspended) {
        const logs = await this.apiService.vaultGetStateChangeLogs(subscription.subscription, 1, 1);
        if (logs?.logs?.length > 0) {
          this.suspensionReason.set(logs.logs[0].reason || '');
        }
      } else {
        this.suspensionReason.set('');
      }
    }
    if (!silent) this.loadingService.hide();
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

    const modalResult = await this.subscriptionStateService.show(currentService.state);
    if (modalResult !== null && modalResult.state !== currentService.state) {
        this.loadingService.show('Changing state...');
        try {
            const result = await this.apiService.vaultUpdateSubscriptionState(currentService.subscription, modalResult.state, modalResult.reason);
            if (result) {
                this.subscription.update(sub => sub ? {
                    ...sub,
                    state: modalResult.state,
                    stateName: this.stateNames[modalResult.state] ?? String(modalResult.state),
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

  async getHoldings(start: number, offset: number, silent = false) {
    if (!silent) this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetSubscriptionHoldings(this.subscriptionAddress, start - 1, offset);
    if (data?.holdings) {
      const next = data.holdings.map((h: any) => this.mapVaultHolding(h));
      if (silent) {
        const prev = new Map(this.holdings().map(h => [h.asset, h.balance]));
        const changed: string[] = [];
        for (const h of next) {
          const prevBal = prev.get(h.asset);
          if (prevBal === undefined || prevBal !== h.balance) changed.push(h.asset);
        }
        this.flashHoldingKeys(changed);
      }
      this.holdings.set(next);
    }
    if (!silent) this.holdingPage.set(0);
    if (!silent) this.loadingService.hide();
  }

  async gotoAsset(asset: string) {
    this.router.navigate(['/authorized/assets/details/' + asset]);
  }

  async getTransactions(start: number, offset: number, silent = false) {
    if (!silent) this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetTransactions({ subscription: this.subscriptionAddress }, start - 1, offset);
    if (data?.transactions) {
      const next = data.transactions.map((t: any) => this.mapVaultTransaction(t));
      if (silent) {
        const prevIds = new Set(this.transactions().map(t => t.trxId));
        this.flashTrxIds(next.filter((t: AssetTransaction) => !prevIds.has(t.trxId)).map((t: AssetTransaction) => t.trxId));
      }
      this.transactions.set(next);
    }
    if (!silent) this.trxPage.set(0);
    if (!silent) this.loadingService.hide();
  }

  async gotoEntity(entity: string) {
    this.router.navigate(['/authorized/entities/details/' + entity]);
  }  

  async gotoService(service: string) {
    this.router.navigate(['/authorized/services/details/' + service]);
  }

  clearHoldingFilters() {
    this.filterHoldingAsset.set('');
    this.filterHoldingCurrency.set('');
    this.filterHoldingBalanceOp.set('');
    this.filterHoldingBalanceAmt.set(null);
    this.holdingPage.set(0);
  }

  clearFilters() {
    this.filterType.set('');
    this.filterAsset.set('');
    this.filterCurrency.set('');
    this.filterTokensOp.set('');
    this.filterTokensAmt.set(null);
    this.filterStartDate.set('');
    this.filterEndDate.set('');
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
      `From: ${this.filterStartDate() || 'None'}`,
      `To: ${this.filterEndDate() || 'None'}`,
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
        4: { halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
      },
      head: [[
        { content: '#' },
        { content: 'Time' },
        { content: 'Type' },
        { content: 'Asset' },
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
        t.currencyCode,
        this.utils.formatTokens(t.tokens),
        this.utils.formatPrice(t.price),
        this.utils.formatPrice(t.totalPrice),
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`subscription_transactions_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'subscription_transactions');
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
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
      head: [[
        { content: 'Asset' },
        { content: 'Currency' },
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
          h.currencyCode,
          this.utils.formatTokens(h.balance),
          this.utils.formatPrice(h.cost),
          this.utils.formatPrice(value),
          this.utils.formatPrice(pl),
          plPct,
        ];
      }),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`subscription_holdings_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'subscription_holdings');
  }

  exportHoldingsExcel() {
    const rows = this.filteredHoldings().map(h => {
      const value = h.balance * h.currentBid;
      const pl = value - h.cost;
      return {
        'Asset': `${h.assetName}${h.assetSymbol ? ` (${h.assetSymbol})` : ''}`,
        'Currency': h.currencyCode,
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
    this.auditService.logExport('excel', 'subscription_holdings');
  }

  exportExcel() {
    const rows = this.filteredTransactions().map(t => ({
      'Time': this.utils.formatDate(t.time),
      'Type': t.trxType,
      'Asset': `${t.assetName} (${t.assetSymbol})`,
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
    XLSX.writeFile(wb, `subscription_transactions_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'subscription_transactions');
  }

  // ─── Credit ─────────────────────────────────────────────────────────────────

  private readonly creditTrxTypeNames: Record<number, string> = {
    1: 'Deposit', 2: 'Withdraw', 3: 'Transfer', 4: 'Withhold',
  };
  private readonly creditTrxStateNames: Record<number, string> = {
    1: 'Initiated', 2: 'Success', 3: 'Failed', 4: 'Cancelled',
  };
  // Mirrors the 'Credit Transaction Origin' VariablesProxy category — see
  // Tarmiiz Global Variables/Contracts/Global Variables/scripts/2.initiate.js.
  // Used as a fallback label; primary source is `originMap` populated from the API.
  private readonly creditOriginNames: Record<number, string> = {
    1: 'Deposit',
    2: 'Withdraw',
    3: 'Liquidity Inject',
    4: 'Liquidity Withdraw',
    5: 'Service Send',
    6: 'Service Withhold',
    7: 'Service Settle',
    8: 'Cross Service Settle',
    9: 'Peer To Peer',
    10: 'Regulator Transfer',
  };
  private originMap: Record<number, string> = {};

  private mapCreditTransaction(raw: any): CreditTransaction {
    return {
      trxId: raw.trxId ?? 0,
      service: raw.service ?? '',
      serviceName: raw.serviceName ?? '',
      paymentProcessor: raw.paymentProcessor ?? '',
      paymentProcessorName: raw.paymentProcessorName ?? '',
      from: raw.from ?? '',
      fromName: raw.fromName ?? '',
      to: raw.to ?? '',
      toName: raw.toName ?? '',
      trxType: raw.trxType ?? 0,
      trxTypeName: this.creditTrxTypeNames[raw.trxType] ?? String(raw.trxType),
      currencyCode: raw.currencyCode ?? 0,
      currencySymbol: raw.currencySymbol ?? '',
      amount: raw.amount ?? 0,
      trxData: raw.trxData ?? '',
      trxState: raw.trxState ?? 0,
      trxStateName: this.creditTrxStateNames[raw.trxState] ?? String(raw.trxState),
      startTime: raw.startTime ?? 0,
      updateTime: raw.updateTime ?? 0,
      assetTrxId: Number(raw.assetTrxId ?? 0),
      origin: Number(raw.origin ?? 0),
      originName: this.originMap[raw.origin] ?? this.creditOriginNames[raw.origin] ?? (raw.origin ? `Origin #${raw.origin}` : ''),
    } as CreditTransaction;
  }

  async getCreditBalances(silent = false) {
    const balances = await this.apiService.vaultGetSubscriptionCreditBalance(this.subscriptionAddress);
    if (balances) {
      if (silent) {
        const prev = new Map(this.creditBalances().map(b => [b.currencyCode, b.balance]));
        const changed: number[] = [];
        for (const b of balances) {
          const p = prev.get(b.currencyCode);
          if (p === undefined || p !== b.balance) changed.push(b.currencyCode);
        }
        this.flashCreditCodes(changed);
      }
      this.creditBalances.set(balances);
    }
  }

  async openCreditDeposit() {
    const sub = this.subscription();
    if (!sub) return;
    if (!sub.service) {
      await this.alertService.show('Error', 'Subscription has no token-issuer service.');
      return;
    }
    const service = await this.apiService.vaultGetService(sub.service);
    const paymentProcessor = service?.payment_processor || service?.paymentProcessor || '';
    const currencies = this.creditBalances();
    if (currencies.length === 0) {
      await this.alertService.show('Error', 'No currencies available. Wait for credit balances to load.');
      return;
    }
    const result = await this.creditDepositService.show({
      subscriptionAddress: this.subscriptionAddress,
      service: sub.service,
      paymentProcessor,
      currencies,
    });
    if (result) {
      await this.alertService.show('Credit Deposited', result.txHash ? ('Tx: ' + result.txHash) : 'Deposit successful.');
      await this.getCreditData();
    }
  }

  async getCreditData() {
    this.loadingService.show('Loading credit data...');
    const [, trxData, originVars] = await Promise.all([
      this.getCreditBalances(),
      this.apiService.vaultGetSubscriptionCreditTransactions(this.subscriptionAddress, 1, 50),
      this.apiService.vaultGetGlobalVariablesByCategory('Credit Transaction Origin').catch(() => null),
    ]);

    if (Array.isArray(originVars)) {
      this.originMap = {};
      for (const v of originVars) {
        if (v?.variableId != null && v?.name) this.originMap[Number(v.variableId)] = v.name;
      }
    }

    if (trxData?.transactions) {
      const mapped = trxData.transactions.map((t: any) => this.mapCreditTransaction(t));
      mapped.sort((a: CreditTransaction, b: CreditTransaction) => b.startTime - a.startTime);
      this.creditTransactions.set(mapped);
    }
    this.creditTrxPage.set(0);
    this.loadingService.hide();
  }

  clearCreditFilters() {
    this.filterCreditType.set('');
    this.filterCreditCurrency.set('');
    this.filterCreditAmountOp.set('');
    this.filterCreditAmountVal.set(null);
    this.filterCreditStartDate.set('');
    this.filterCreditEndDate.set('');
    this.creditTrxPage.set(0);
  }

  getCreditTrxTypeClass(trxType: number): string {
    switch (trxType) {
      case 1: return 'bg-green-100 text-green-800';
      case 2: return 'bg-orange-100 text-orange-800';
      case 3: return 'bg-blue-100 text-blue-800';
      case 4: return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getCreditTrxStateClass(state: number): string {
    switch (state) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-red-100 text-red-800';
      case 4: return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  exportCreditPdf() {
    const txs = this.filteredCreditTransactions();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    const sub = this.subscription();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Credit Transactions - ${sub?.subscription ?? ''}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    // Balances summary table
    const balances = this.creditBalances();
    if (balances.length > 0) {
      autoTable(doc, {
        startY: 28,
        margin: { left: pad, right: pad },
        styles: { fontSize: 8 },
        headStyles: { fillColor: [74, 85, 104] },
        columnStyles: { 1: { halign: 'right' } },
        head: [[
          { content: 'Currency' },
          { content: 'Balance', styles: { halign: 'right' } },
        ]],
        body: balances.map(b => [
          `${b.currencyName} (${b.currencySymbol})`,
          this.utils.formatPrice(b.balance),
        ]),
      });
    }

    autoTable(doc, {
      startY: (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 6 : 28,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: {
        0: { cellWidth: 10 },
        4: { halign: 'right' },
      },
      head: [[
        { content: '#' },
        { content: 'Date' },
        { content: 'Type' },
        { content: 'Currency' },
        { content: 'Amount', styles: { halign: 'right' } },
        { content: 'State' },
      ]],
      body: txs.map((t, i) => [
        i + 1,
        this.utils.formatDate(t.startTime),
        t.trxTypeName,
        t.currencySymbol,
        this.utils.formatPrice(t.amount),
        t.trxStateName,
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`subscription_credit_transactions_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'subscription_credit');
  }

  exportCreditExcel() {
    const rows = this.filteredCreditTransactions().map(t => ({
      'Date': this.utils.formatDate(t.startTime),
      'Type': t.trxTypeName,
      'Currency': t.currencySymbol,
      'Amount': t.amount,
      'State': t.trxStateName,
      'From': t.from,
      'To': t.to,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Credit Transactions');

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `subscription_credit_transactions_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'subscription_credit');
  }

  viewTransactionDetails(trx: AssetTransaction): void {
    this.trxInfoService.show(trx);
    this.auditService.logView('transaction', { trxId: trx.trxId, trxType: trx.trxType });
  }

}
