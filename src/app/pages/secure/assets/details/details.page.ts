import { Component, inject, OnInit, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { Asset, AssetHolder, AssetPrice, AssetTransaction } from '../../../../shared/models/data.model';
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
  private rpcService = inject(RpcService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private assetStateService = inject(ModalAssetStateService);
  trxInfoService = inject(ModalTransactionInfoService);

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
  pagedHolders = computed(() => {
    const start = this.holderPage() * this.holderPageSize;
    return this.holders().slice(start, start + this.holderPageSize);
  });
  totalHolderPages = computed(() => Math.ceil(this.holders().length / this.holderPageSize));

  transactions = signal<AssetTransaction[]>([]);
  trxPage = signal(0);
  readonly trxPageSize = 10;
  pagedTransactions = computed(() => {
    const start = this.trxPage() * this.trxPageSize;
    return this.transactions().slice(start, start + this.trxPageSize);
  });
  totalTrxPages = computed(() => Math.ceil(this.transactions().length / this.trxPageSize));

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
    this.activeTab.set('overview');
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

  async getAssetDetails() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.assetInfo(this.assetAddress);
    this.asset.set(data.result?.asset);
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
        await this.rpcService.assetChangeState(currentAsset.address, newState);
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
    const priceHistoryInfo = await this.rpcService.assetPriceHistory(this.assetAddress, start, offset);
    this.priceHistory.set(priceHistoryInfo.result?.history);
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
    const [data, priceData] = await Promise.all([
      this.rpcService.assetHolders(this.assetAddress, start, offset),
      this.rpcService.assetCurrentPrice(this.assetAddress)
    ]);
    if (data.result?.holders) this.holders.set(data.result.holders);
    if (priceData.result?.price) this.currentBid.set(priceData.result.price.bid);
    this.holderPage.set(0);
    this.loadingService.hide();
  }

  async getTransactions(start: number, offset: number) {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.assetTransactionsByAsset(this.assetAddress, start, offset);
    if (data.result?.transactions) this.transactions.set(data.result?.transactions);
    this.trxPage.set(0);
    this.loadingService.hide();
  }  
}