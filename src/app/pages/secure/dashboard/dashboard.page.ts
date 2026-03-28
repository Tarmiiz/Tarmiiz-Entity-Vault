import { Component, computed, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonTitle } from '@ionic/angular/standalone'

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { AssetTransaction, Subscription, User } from '../../../shared/models/data.model';

import { ApiService } from '../../../shared/services/api.service';
import { UtilsService } from '../../../shared/services/utils.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/shared/services/auth.service';
import { ModalTransactionInfoService } from '../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../shared/components/modal-transaction-info/modal-transaction-info.component';

interface StatCard {
  title: string;
  value: number;
  path: string;
  icon: string;
  loading: boolean;
}

interface DashboardKpis {
  totalAum: number;
  activeInvestors: number;
  pendingKyc: number;
  netFlow30d: number;
  netFlowTokens30d: number;
}

interface WeeklyActivityPoint {
  week: string;
  subscribeTokens: number; redeemTokens: number;
  subscribeValue: number;  redeemValue: number;
}

interface AumByAsset {
  address: string; name: string; symbol: string;
  aum: number; circulating: number; bid: number;
}


interface TopAsset {
  address: string; name: string; symbol: string;
  circulating: number; bid: number; ask: number;
  aum: number; price_ts: number; previousBid: number; state: number;
}

interface DashboardSummary {
  kpis: DashboardKpis;
  charts: {
    weeklyActivity: WeeklyActivityPoint[];
    aumByAsset: AumByAsset[];
  };
  topAssets: TopAsset[];
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    IonTitle,
    CommonModule, FormsModule,
    HeaderComponent,
    ModalTransactionInfoComponent,
  ]
})
export class DashboardPage implements OnInit {
  private apiService = inject(ApiService);
  utils = inject(UtilsService);
  private alertService = inject(AlertService);
  private router = inject(Router);
  private authService = inject(AuthService);
  private modalTransactionInfoService = inject(ModalTransactionInfoService);

  userInfo!: User;

  lastSynced: number = 0;

  latestTransactions = signal<AssetTransaction[]>([]);
  transactionsLoading = signal(true);

  latestSubscriptions = signal<Subscription[]>([]);
  subscriptionsLoading = signal(true);

  stats = signal<StatCard[]>([
    { title: 'Total Services', value: 0, path: '/authorized/services/list', loading: true, icon: 'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm16 14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2ZM4 13a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Zm16-2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6Z' },
    { title: 'Total Assets', value: 0, path: '/authorized/assets/list', loading: true, icon: 'M16.872 9.687 20 6.56 17.44 4 4 17.44 6.56 20 16.873 9.687Zm0 0-2.56-2.56M6 7v2m0 0v2m0-2H4m2 0h2m7 7v2m0 0v2m0-2h-2m2 0h2M8 4h.01v.01H8V4Zm2 2h.01v.01H10V6Zm2-2h.01v.01H12V4Zm8 8h.01v.01H20V12Zm-2 2h.01v.01H18V14Zm2 2h.01v.01H20V16Z' },
    { title: 'Total Subscriptions', value: 0, path: '/authorized/subscriptions/list', loading: true, icon: 'M7 6H5m2 3H5m2 3H5m2 3H5m2 3H5m11-1a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2M7 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z' },
    { title: 'Total Transactions', value: 0, path: '/authorized/transactions/list', loading: true, icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3Z' },
  ]);

  // ─── Dashboard summary (charts + KPIs) ───────────────────────────────────────

  @ViewChild('activityChart') activityChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('aumChart')      aumChartRef!:      ElementRef<HTMLCanvasElement>;

  private activityChartInstance: any = null;
  private aumChartInstance:      any = null;

  dashboardSummary  = signal<DashboardSummary | null>(null);
  summaryLoading    = signal(true);

  totalAum         = computed(() => this.dashboardSummary()?.kpis.totalAum ?? 0);
  activeInvestors  = computed(() => this.dashboardSummary()?.kpis.activeInvestors ?? 0);
  pendingKyc       = computed(() => this.dashboardSummary()?.kpis.pendingKyc ?? 0);
  netFlow30d       = computed(() => this.dashboardSummary()?.kpis.netFlow30d ?? 0);
  topAssets       = computed(() => this.dashboardSummary()?.topAssets ?? []);
  weeklyActivity  = computed(() => this.dashboardSummary()?.charts.weeklyActivity ?? []);
  aumByAsset      = computed(() => this.dashboardSummary()?.charts.aumByAsset ?? []);

  constructor() { }

  async ngOnInit() {
    await this.loadPageData();
  }

  async goTo(path: string) {
    this.router.navigate([path]);
  }

  viewDetails(trx: AssetTransaction) {
    this.modalTransactionInfoService.show(trx);
  }

  async ionViewWillEnter() {
    await this.loadPageData();
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

  private async loadPageData() {
    await this.authService.ready();
    this.userInfo = this.authService.userInfo;
    if (!this.userInfo) this.router.navigate(['/public/user/login']);
    else {
      if (this.userInfo.role !== 1) {
        await Promise.all([
          this.getStats(),
          this.getDashboardSummary(),
          this.getSubscriptions(),
          this.getTransactions(),
        ]);
      }
    }
  }

  async getStats() {
    const status = await this.apiService.vaultGetSyncStatus();
    if (status) {
      this.lastSynced = status.lastSync ? Number(status.lastSync) : 0;
      this.stats.update(cards => [
        { ...cards[0], value: status.serviceCount, loading: false },
        { ...cards[1], value: status.assetCount,   loading: false },
        { ...cards[2], value: status.subCount,     loading: false },
        { ...cards[3], value: status.trxCount,     loading: false },
      ]);
    } else {
      this.stats.update(cards => cards.map(c => ({ ...c, loading: false })));
    }
  }

  async getSubscriptions() {
    this.subscriptionsLoading.set(true);
    const result = await this.apiService.vaultGetSubscriptions(undefined, 0, 5);
    if (result?.subscriptions) {
      this.latestSubscriptions.set(result.subscriptions.map((s: any) => this.mapVaultSubscription(s)));
    }
    this.subscriptionsLoading.set(false);
  }

  getStateClass(state: number): string {
    switch (state) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getTrxTypeClass(type: string): string {
    switch (type) {
      case 'Subscribe': return 'bg-green-100 text-green-800';
      case 'Redeem':    return 'bg-red-100 text-red-800';
      case 'Transfer':  return 'bg-blue-100 text-blue-800';
      default:          return 'bg-gray-100 text-gray-800';
    }
  }

  async getTransactions() {
    this.transactionsLoading.set(true);
    const result = await this.apiService.vaultGetTransactions(undefined, 0, 5);
    if (result?.transactions) {
      this.latestTransactions.set(result.transactions.map((t: any) => this.mapVaultTransaction(t)));
    }
    this.transactionsLoading.set(false);
  }

  async getDashboardSummary() {
    this.summaryLoading.set(true);
    const result = await this.apiService.vaultGetDashboardSummary();
    if (result) {
      this.dashboardSummary.set(result as DashboardSummary);
    }
    this.summaryLoading.set(false);
    // Canvases are now in the DOM (loading state hidden) — safe to render
    setTimeout(() => this.renderAllCharts(), 50);
  }

  private async renderAllCharts() {
    const { Chart, registerables } = await import('chart.js') as any;
    Chart.register(...registerables);
    this.renderActivityChart(Chart);
    this.renderAumChart(Chart);
  }

  private renderActivityChart(Chart: any) {
    if (!this.activityChartRef?.nativeElement) return;
    this.activityChartInstance?.destroy();
    const data = this.weeklyActivity();
    this.activityChartInstance = new Chart(this.activityChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: data.map((d: WeeklyActivityPoint) => d.week),
        datasets: [
          { type: 'bar', label: 'Subscribe (tokens)', data: data.map((d: WeeklyActivityPoint) => d.subscribeTokens), backgroundColor: 'rgba(52,211,153,0.7)', barPercentage: 0.4, yAxisID: 'y' },
          { type: 'bar', label: 'Subscribe (value)',  data: data.map((d: WeeklyActivityPoint) => d.subscribeValue),  backgroundColor: 'rgba(5,150,105,0.8)',  barPercentage: 0.4, yAxisID: 'y1' },
          { type: 'bar', label: 'Redeem (tokens)',    data: data.map((d: WeeklyActivityPoint) => d.redeemTokens),    backgroundColor: 'rgba(252,165,165,0.7)', barPercentage: 0.4, yAxisID: 'y' },
          { type: 'bar', label: 'Redeem (value)',     data: data.map((d: WeeklyActivityPoint) => d.redeemValue),     backgroundColor: 'rgba(185,28,28,0.8)',  barPercentage: 0.4, yAxisID: 'y1' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          y:  { beginAtZero: true, position: 'left',  title: { display: true, text: 'Tokens' } },
          y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Value' } },
        },
      },
    });
  }

  private renderAumChart(Chart: any) {
    if (!this.aumChartRef?.nativeElement) return;
    this.aumChartInstance?.destroy();
    const data = this.aumByAsset();
    const colors = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#fb923c'];
    this.aumChartInstance = new Chart(this.aumChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: data.map((d: AumByAsset) => d.symbol),
        datasets: [{ data: data.map((d: AumByAsset) => d.aum), backgroundColor: colors }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: { legend: { position: 'right' } },
      },
    });
  }


  priceChange(asset: TopAsset): number {
    if (!asset.previousBid || asset.previousBid === 0) return 0;
    return ((asset.bid - asset.previousBid) / asset.previousBid) * 100;
  }
}
