import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AnalyticsCardComponent } from '../components/analytics-card.component';
import { AnalyticsIntervalSelectComponent } from '../components/analytics-interval-select.component';

interface DexBucket {
  label: string; volume: number; notional: number;
  avgPrice: number; premiumPct: number;
}
interface DexAsset {
  name: string; symbol: string; navBid: number; buckets: DexBucket[];
}

@Component({
  selector: 'app-analytics-dex-secondary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, HeaderComponent, AnalyticsCardComponent, AnalyticsIntervalSelectComponent, TranslatePipe],
  template: `
    <app-header [title]="'analytics.dexSecondary.title' | translate"></app-header>
    <div class="grow p-1 bg-gray-300 pt-4 overflow-y-auto">
      <app-analytics-card
        [title]="'analytics.dexSecondary.chart.title' | translate"
        [subtitle]="'analytics.dexSecondary.chart.subtitle' | translate"
        [loading]="loading()"
        [empty]="!loading() && assetCodes().length === 0"
        [emptyMessage]="'analytics.dexSecondary.chart.emptyMessage' | translate">
        <div card-actions class="flex items-center gap-3">
          @if (assetCodes().length > 1) {
            <label class="inline-flex items-center gap-2 text-sm text-gray-700">
              <span class="font-medium">{{ 'analytics.dexSecondary.filters.assetLabel' | translate }}</span>
              <select class="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                      [ngModel]="selectedAsset()"
                      (ngModelChange)="onAsset($event)">
                @for (a of assetCodes(); track a) {
                  <option [value]="a">{{ data()[a]?.symbol || a }}</option>
                }
              </select>
            </label>
          }
          <app-analytics-interval-select
            [value]="interval()"
            (valueChange)="onInterval($event)">
          </app-analytics-interval-select>
        </div>
        <div class="h-80">
          <canvas #chart></canvas>
        </div>
      </app-analytics-card>
    </div>
  `,
})
export class DexSecondaryPage implements OnInit, OnDestroy {
  private apiService = inject(ApiService);
  private translate = inject(TranslateService);

  @ViewChild('chart') chartRef?: ElementRef<HTMLCanvasElement>;

  interval      = signal<string>('1d');
  loading       = signal<boolean>(true);
  data          = signal<Record<string, DexAsset>>({});
  selectedAsset = signal<string | null>(null);
  assetCodes    = computed(() => Object.keys(this.data()));

  private chartInstance: any;

  async ngOnInit() { await this.load(); }
  ngOnDestroy() { this.chartInstance?.destroy(); }

  async onInterval(v: string) {
    this.interval.set(v);
    await this.load();
  }

  onAsset(addr: string) {
    this.selectedAsset.set(addr);
    setTimeout(() => this.render(), 50);
  }

  private async load() {
    this.loading.set(true);
    try {
      const res = await this.apiService.vaultGetDexVolume(this.interval(), 30) as any;
      const d = (res?.dataByAsset ?? {}) as Record<string, DexAsset>;
      this.data.set(d);
      const codes = Object.keys(d);
      if (!this.selectedAsset() || !codes.includes(this.selectedAsset()!)) {
        this.selectedAsset.set(codes[0] ?? null);
      }
      setTimeout(() => this.render(), 50);
    } finally {
      this.loading.set(false);
    }
  }

  private async render() {
    if (!this.chartRef?.nativeElement) return;
    const code = this.selectedAsset();
    if (!code) { this.chartInstance?.destroy(); this.chartInstance = null; return; }
    const a = this.data()[code];
    if (!a) return;

    const labels    = a.buckets.map(b => b.label);
    const volume    = a.buckets.map(b => b.volume);
    const premium   = a.buckets.map(b => Number(b.premiumPct.toFixed(3)));

    const { Chart, registerables } = await import('chart.js') as any;
    Chart.register(...registerables);
    this.chartInstance?.destroy();
    this.chartInstance = new Chart(this.chartRef.nativeElement, {
      data: {
        labels,
        datasets: [
          { type: 'bar',  label: this.translate.instant('analytics.dexSecondary.chart.datasetVolume'), data: volume, backgroundColor: 'rgba(99,102,241,0.5)', borderColor: 'rgba(99,102,241,1)', borderWidth: 1, yAxisID: 'y' },
          { type: 'line', label: this.translate.instant('analytics.dexSecondary.chart.datasetPremium'), data: premium, borderColor: 'rgba(245,158,11,1)', backgroundColor: 'rgba(245,158,11,0.15)', tension: 0.3, pointRadius: 2, borderWidth: 2, yAxisID: 'y1' },
        ],
      } as any,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' }, title: { display: true, text: this.translate.instant('analytics.dexSecondary.chart.navBidTitle', { symbol: a.symbol, navBid: a.navBid }) } },
        scales: {
          x:  { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y:  { beginAtZero: true, position: 'left',  title: { display: true, text: this.translate.instant('analytics.dexSecondary.chart.volumeAxis') } },
          y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: this.translate.instant('analytics.dexSecondary.chart.premiumAxis') } },
        },
      },
    });
  }
}
