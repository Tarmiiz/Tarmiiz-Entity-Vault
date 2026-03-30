import { Component, inject, OnInit, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { Subscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { ApiService } from '../../../../shared/services/api.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { Asset, AssetHolder, AssetPrice, AssetTransaction, User } from '../../../../shared/models/data.model';
import { AuthService } from '../../../../shared/services/auth.service';
import { ModalAssetStateService } from '../modals/modal-asset-state/modal-asset-state.service';
import { ModalAssetStateComponent } from "../modals/modal-asset-state/modal-asset-state.component";
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
    ModalAssetStateComponent,
    ModalTransactionInfoComponent
  ]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private assetStateService = inject(ModalAssetStateService);
  trxInfoService = inject(ModalTransactionInfoService);
  utils = inject(UtilsService);
  private socketService = inject(SocketService);
  private authService = inject(AuthService);

  userInfo!: User;
  private _socketSub: Subscription | null = null;

  @ViewChild('priceChart') priceChartRef!: ElementRef<HTMLCanvasElement>;

  activeTab = signal<'overview' | 'info' | 'price' | 'holders' | 'trxs'>('overview');

  loadingData: boolean = false;

  assetAddress = '';
  asset = signal<Asset | undefined>(undefined);
  priceHistory = signal<AssetPrice[]>([]);
  pricePage = signal(0);
  readonly pricePageSize = 5;
  pagedPriceHistory = computed(() => {
    const start = this.pricePage() * this.pricePageSize;
    return this.priceHistory().slice(start, start + this.pricePageSize);
  });
  totalPricePages = computed(() => Math.ceil(this.priceHistory().length / this.pricePageSize));

  private chartInstance: any = null;

  holders = signal<AssetHolder[]>([]);
  currentBid = signal<number>(0);
  holderPage = signal(0);
  readonly holderPageSize = 10;
  filterHolder = signal<string>('');
  filterBalanceOp = signal<'' | 'gt' | 'lt'>('');
  filterBalanceAmt = signal<number | null>(null);
  filteredHolders = computed(() => {
    const q = this.filterHolder().toLowerCase().trim();
    const op = this.filterBalanceOp();
    const amt = this.filterBalanceAmt();
    return this.holders().filter(h => {
      if (q && !h.holder.toLowerCase().includes(q)) return false;
      if (op && amt !== null) {
        if (op === 'gt' && h.balance <= amt) return false;
        if (op === 'lt' && h.balance >= amt) return false;
      }
      return true;
    });
  });
  pagedHolders = computed(() => {
    const start = this.holderPage() * this.holderPageSize;
    return this.filteredHolders().slice(start, start + this.holderPageSize);
  });
  totalHolderPages = computed(() => Math.ceil(this.filteredHolders().length / this.holderPageSize));

  transactions = signal<AssetTransaction[]>([]);
  trxPage = signal(0);
  readonly trxPageSize = 10;

  // filters
  filterType = signal<string>('');
  filterSubscription = signal<string>('');
  filterService = signal<string>('');
  filterTokensOp = signal<'' | 'gt' | 'lt'>('');
  filterTokensAmt = signal<number | null>(null);

  uniqueSubscriptions = computed(() =>
    [...new Set(this.transactions().filter(t => t.subscription).map(t => t.subscription))].sort()
  );
  uniqueServices = computed(() =>
    [...new Map(this.transactions().map(t => [t.service, t.serviceName])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  filteredTransactions = computed(() => {
    const type = this.filterType();
    const subscription = this.filterSubscription();
    const service = this.filterService();
    const op = this.filterTokensOp();
    const amt = this.filterTokensAmt();
    return this.transactions().filter(t => {
      if (type && t.trxType !== type) return false;
      if (subscription && t.subscription !== subscription) return false;
      if (service && t.service !== service) return false;
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
  latestPrice = computed(() => {
    const h = this.priceHistory();
    if (!h || h.length === 0) return null;
    return [...h].sort((a, b) => b.timestamp - a.timestamp)[0];
  });
  subscribeCount = computed(() => this.transactions().filter(t => t.trxType === 'Subscribe').length);
  redeemCount = computed(() => this.transactions().filter(t => t.trxType === 'Redeem').length);
  lastTrx = computed(() => {
    const t = this.transactions();
    if (!t || t.length === 0) return null;
    return [...t].sort((a, b) => b.time - a.time)[0];
  });
  marketValue = computed(() => {
    const asset = this.asset();
    const lp = this.latestPrice();
    if (!asset || !lp || lp.bid === 0) return null;
    return asset.circulating * lp.bid;
  });

  constructor() {
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.assetAddress = address;
    }
  }

  async ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.activeTab.set('overview');
    await this.reload();
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.reload());
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  private async reload() {
    await this.getAssetDetails();
    await Promise.all([
      this.getPriceHistory(1, 50),
      this.getHolders(1, 500),
      this.getTransactions(1, 50),
    ]);
  }

  setTab(tab: 'overview' | 'info' | 'price' | 'holders' | 'trxs') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getAssetDetails();
    if (tab === 'price') this.getPriceHistory(1, 50);
    if (tab === 'holders') this.getHolders(1, 500);
    if (tab === 'trxs') this.getTransactions(1, 50);
  }

  private readonly stateNames: Record<number, string> = {
    0: 'Inactive', 1: 'Initiated', 2: 'Active', 3: 'Suspended', 4: 'Deactivated',
  };

  private mapVaultAsset(raw: any): Asset {
    return {
      address: raw.address,
      name: raw.name,
      symbol: raw.symbol,
      tokenType: raw.token_type ?? 0,
      tokenTypeName: raw.token_type_name ?? String(raw.token_type ?? ''),
      assetType: raw.asset_type ?? 0,
      assetTypeName: raw.asset_type_name ?? String(raw.asset_type ?? ''),
      metadata: typeof raw.metadata === 'object' ? JSON.stringify(raw.metadata ?? {}) : (raw.metadata ?? ''),
      totalSupply: raw.total_supply ?? 0,
      circulating: raw.circulating ?? 0,
      countryCode: 0,
      countryName: raw.country_name ?? '',
      currencyCode: raw.currency_code ?? '',
      currencyName: raw.currency_name ?? '',
      createdOn: raw.created_on ?? 0,
      services: (raw.services ?? []).map((s: string) => ({ service: s, serviceName: s })),
      issuer: raw.issuer ?? '',
      issuerName: raw.issuer_name ?? raw.issuer ?? '',
      manager: raw.manager ?? '',
      managerName: raw.manager_name ?? raw.manager ?? '',
      regulator: raw.regulator ?? '',
      regulatorName: raw.regulator_name ?? '',
      regulatorSymbol: '',
      suspended: raw.suspended === true || raw.suspended === 1,
      state: raw.state ?? 0,
      stateName: raw.asset_state_name ?? this.stateNames[raw.state] ?? String(raw.state ?? ''),
    };
  }

  private mapVaultTransaction(raw: any): AssetTransaction {
    let trxRefNo = '';
    if (raw.data && typeof raw.data === 'object') {
      trxRefNo = raw.data.trxRefNo || '';
    }
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
    };
  }

  async getAssetDetails() {
    this.loadingService.show('Loading data...');
    const [raw, services] = await Promise.all([
      this.apiService.vaultGetAsset(this.assetAddress),
      this.apiService.vaultGetAssetServices(this.assetAddress),
    ]);
    if (raw) {
      const asset = this.mapVaultAsset(raw);
      if (services) {
        asset.services = services.map((s: any) => ({ service: s.service, serviceName: s.service_name ?? s.service }));
      }
      this.asset.set(asset);
    }
    this.loadingService.hide();
  }

  getTrxTypeClass(trxType: string): string {
    switch (trxType) {
      case 'Subscribe': return 'bg-green-100 text-green-800';
      case 'Redeem':    return 'bg-orange-100 text-orange-800';
      default:          return 'bg-gray-100 text-gray-800';
    }
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

  async openChangeStateModal() {
    const currentAsset = this.asset();
    if (!currentAsset) return;

    const newState = await this.assetStateService.show(currentAsset.state);
    if (newState !== null && newState !== currentAsset.state) {
      this.loadingService.show('Changing state...');
      try {
        await this.apiService.vaultUpdateAssetState(currentAsset.address, newState);
        await this.getAssetDetails();
      } catch (error) {
        console.error('Failed to change state', error);
      } finally {
        this.loadingService.hide();
      }
    }
  }

  async gotoLink(address: string) {
    this.router.navigate(['/authorized/entities/details/' + address]);
  }

  async gotoService(address: string) {
    this.router.navigate(['/authorized/services/details/' + address]);
  }

  async gotoSubscriber(subscription: string) {
    this.router.navigate(['/authorized/subscriptions/details/' + subscription]);
  }

  async getPriceHistory(start: number, offset: number) {
    this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetAssetPriceHistory(this.assetAddress, start - 1, offset);
    this.priceHistory.set(data?.history ?? []);
    this.pricePage.set(0);
    this.loadingService.hide();

    // Wait for Angular to render the canvas before drawing
    setTimeout(() => this.renderChart(), 50);
  }

  private async renderChart() {
    const history = this.priceHistory();
    if (!history || history.length === 0) return;

    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

    const canvas = this.priceChartRef?.nativeElement;
    if (!canvas) return;

    // Destroy previous chart instance before creating a new one
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }

    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);

    const labels = sorted.map(p =>
      new Date(p.timestamp * 1000).toLocaleDateString('en-GB', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    );
    const bidData = sorted.map(p => p.bid);
    const askData = sorted.map(p => p.ask);

    this.chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Bid',
            data: bidData,
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.08)',
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#4f46e5',
            fill: true,
            tension: 0.4,
          },
          {
            label: 'Ask',
            data: askData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#10b981',
            fill: true,
            tension: 0.4,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 20,
              font: { size: 12, weight: 'bold' }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.9)',
            titleColor: '#f9fafb',
            bodyColor: '#d1d5db',
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(4)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { font: { size: 11 }, maxRotation: 45 }
          },
          y: {
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: {
              font: { size: 11 },
              callback: (value) => Number(value).toFixed(4)
            }
          }
        }
      }
    });
  }

  async getHolders(start: number, offset: number) {
    this.loadingService.show('Loading data...');
    const [holdersData, priceData] = await Promise.all([
      this.apiService.vaultGetAssetHolders(this.assetAddress, start - 1, offset),
      this.apiService.vaultGetAssetPrice(this.assetAddress),
    ]);
    if (holdersData?.holders) this.holders.set(holdersData.holders);
    if (priceData?.bid) this.currentBid.set(priceData.bid);
    this.holderPage.set(0);
    this.loadingService.hide();
  }

  async getTransactions(start: number, offset: number) {
    this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetTransactions({ asset: this.assetAddress }, start - 1, offset);
    if (data?.transactions) this.transactions.set(data.transactions.map((t: any) => this.mapVaultTransaction(t)));
    this.trxPage.set(0);
    this.loadingService.hide();
  }

  clearFilters() {
    this.filterType.set('');
    this.filterSubscription.set('');
    this.filterService.set('');
    this.filterTokensOp.set('');
    this.filterTokensAmt.set(null);
    this.trxPage.set(0);
  }

  clearHolderFilter() {
    this.filterHolder.set('');
    this.filterBalanceOp.set('');
    this.filterBalanceAmt.set(null);
    this.holderPage.set(0);
  }

  exportHoldersExcel() {
    const bid = this.currentBid();
    const rows = this.filteredHolders().map(h => {
      const value = h.balance * bid;
      const pl = value - h.cost;
      return {
        'Holder': h.holder,
        'Balance': h.balance,
        'Cost': h.cost,
        'Value': value,
        'P/L': pl,
        'P/L %': h.cost > 0 ? +(pl / h.cost * 100).toFixed(4) : null,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Holders');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `asset_holders_${stamp}.xlsx`);
  }

  exportHoldersPdf() {
    const holders = this.filteredHolders();
    const bid = this.currentBid();
    const asset = this.asset();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Holders — ${asset?.name ?? ''}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${this.utils.formatDate(Math.floor(Date.now() / 1000))}`, pad, 21);

    const balanceOp = this.filterBalanceOp();
    const balanceAmt = this.filterBalanceAmt();
    const balanceLabel = balanceOp && balanceAmt !== null
      ? `Balance ${balanceOp === 'gt' ? '>' : '<'} ${balanceAmt}`
      : 'None';
    const filterParts = [
      `Address: ${this.filterHolder() || 'None'}`,
      `Balance: ${balanceLabel}`,
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
      columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      head: [[
        { content: '#' },
        { content: 'Holder' },
        { content: 'Balance', styles: { halign: 'right' } },
        { content: 'Cost', styles: { halign: 'right' } },
        { content: 'Value', styles: { halign: 'right' } },
        { content: 'P/L', styles: { halign: 'right' } },
        { content: 'P/L %', styles: { halign: 'right' } },
      ]],
      body: holders.map((h, i) => {
        const value = h.balance * bid;
        const pl = value - h.cost;
        return [
          i + 1,
          h.holder,
          this.utils.formatTokens(h.balance),
          this.utils.formatPrice(h.cost),
          this.utils.formatPrice(value),
          this.utils.formatPrice(pl),
          h.cost > 0 ? (pl / h.cost * 100).toFixed(2) + '%' : '—',
        ];
      }),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`asset_holders_${stamp}.pdf`);
  }

  exportPdf() {
    const txs = this.filteredTransactions();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    const asset = this.asset();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Transactions - ${asset?.name ?? ''}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${this.utils.formatDate(Math.floor(Date.now() / 1000))}`, pad, 21);

    const svcLabel = this.filterService()
      ? (this.uniqueServices().find(s => s[0] === this.filterService())?.[1] ?? this.filterService())
      : 'None';
    const tokensOp = this.filterTokensOp();
    const tokensAmt = this.filterTokensAmt();
    const tokensLabel = tokensOp && tokensAmt !== null
      ? `${tokensOp === 'gt' ? '>' : '<'} ${tokensAmt}`
      : 'None';
    const filterParts = [
      `Type: ${this.filterType() || 'None'}`,
      `Service: ${svcLabel}`,
      `Subscription: ${this.filterSubscription() || 'None'}`,
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
        { content: 'Subscriptions', styles: { halign: 'center' } },
        { content: 'Tokens', styles: { halign: 'right' } },
        { content: 'Value', styles: { halign: 'right' } },
      ]],
      body: [
        ['Subscribe', subs.length, new Set(subs.map(t => t.subscription)).size, this.utils.formatTokens(sumTokens(subs)), this.utils.formatPrice(sumTotal(subs))],
        ['Redeem', redeem.length, new Set(redeem.map(t => t.subscription)).size, this.utils.formatTokens(sumTokens(redeem)), this.utils.formatPrice(sumTotal(redeem))],
      ],
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: {
        0: { cellWidth: 10 },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
      },
      head: [[
        { content: '#' },
        { content: 'Time' },
        { content: 'Type' },
        { content: 'Service' },
        { content: 'Subscription', styles: { halign: 'center' } },
        { content: 'Tokens', styles: { halign: 'right' } },
        { content: 'Price', styles: { halign: 'right' } },
        { content: 'Total', styles: { halign: 'right' } },
      ]],
      body: txs.map((t, i) => [
        i + 1,
        this.utils.formatDate(t.time),
        t.trxType,
        t.serviceName,
        t.subscription,
        this.utils.formatTokens(t.tokens),
        this.utils.formatPrice(t.price),
        this.utils.formatPrice(t.totalPrice),
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`asset_transactions_${stamp}.pdf`);
  }

  exportExcel() {
    const rows = this.filteredTransactions().map(t => ({
      'Time': this.utils.formatDate(t.time),
      'Type': t.trxType,
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
    XLSX.writeFile(wb, `asset_transactions_${stamp}.xlsx`);
  }

  async gotoSubscription(subscription: string) {
    this.router.navigate(['/authorized/subscriptions/details/' + subscription]);
  }
}