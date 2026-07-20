import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AnalyticsCardComponent } from '../components/analytics-card.component';

interface CurrencyExposure {
  currency: string; currencyName: string;
  inflow: number; outflow: number; netExposure: number;
  trxCount: number; sharePct: number;
}

@Component({
  selector: 'app-analytics-credit-liquidity',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, HeaderComponent, AnalyticsCardComponent, TranslatePipe],
  template: `
    <app-header [title]="'analytics.creditLiquidity.title' | translate"></app-header>
    <div class="grow p-1 bg-gray-300 pt-4 overflow-y-auto">
      <app-analytics-card
        [title]="'analytics.creditLiquidity.chart.title' | translate"
        [subtitle]="'analytics.creditLiquidity.chart.subtitle' | translate"
        [loading]="loading()"
        [empty]="!loading() && rows().length === 0">
        <div class="grid md:grid-cols-2 gap-6">
          <div class="h-80">
            <canvas #chart></canvas>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th class="px-3 py-2 font-medium">{{ 'analytics.creditLiquidity.table.currency' | translate }}</th>
                  <th class="px-3 py-2 font-medium text-right">{{ 'analytics.creditLiquidity.table.inflow' | translate }}</th>
                  <th class="px-3 py-2 font-medium text-right">{{ 'analytics.creditLiquidity.table.outflow' | translate }}</th>
                  <th class="px-3 py-2 font-medium text-right">{{ 'analytics.creditLiquidity.table.net' | translate }}</th>
                  <th class="px-3 py-2 font-medium text-right">{{ 'analytics.creditLiquidity.table.share' | translate }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (r of rows(); track r.currency) {
                  <tr>
                    <td class="px-3 py-2">
                      <div class="font-medium text-gray-900">{{ r.currency }}</div>
                      <div class="text-xs text-gray-500">{{ r.currencyName }}</div>
                    </td>
                    <td class="px-3 py-2 text-right text-emerald-600">{{ r.inflow | number:'1.0-2' }}</td>
                    <td class="px-3 py-2 text-right text-rose-600">{{ r.outflow | number:'1.0-2' }}</td>
                    <td class="px-3 py-2 text-right font-semibold">{{ r.netExposure | number:'1.0-2' }}</td>
                    <td class="px-3 py-2 text-right">{{ r.sharePct | number:'1.0-1' }}%</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </app-analytics-card>
    </div>
  `,
})
export class CreditLiquidityPage implements OnInit, OnDestroy {
  private apiService = inject(ApiService);
  private translate = inject(TranslateService);

  @ViewChild('chart') chartRef?: ElementRef<HTMLCanvasElement>;

  loading = signal<boolean>(true);
  rows    = signal<CurrencyExposure[]>([]);

  private chartInstance: any;

  async ngOnInit() { await this.load(); }
  ngOnDestroy() { this.chartInstance?.destroy(); }

  private async load() {
    this.loading.set(true);
    try {
      const res = await this.apiService.vaultGetCreditExposure() as any;
      this.rows.set((res?.currencies ?? []) as CurrencyExposure[]);
      setTimeout(() => this.render(), 50);
    } finally {
      this.loading.set(false);
    }
  }

  private async render() {
    if (!this.chartRef?.nativeElement) return;
    const rows = this.rows();
    if (!rows.length) { this.chartInstance?.destroy(); this.chartInstance = null; return; }

    const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#fb923c'];
    const labels = rows.map(r => r.currency);
    const values = rows.map(r => Math.max(0, r.netExposure));

    const { Chart, registerables } = await import('chart.js') as any;
    Chart.register(...registerables);
    this.chartInstance?.destroy();
    this.chartInstance = new Chart(this.chartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: labels.map((_, i) => palette[i % palette.length]) }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'right' },
          title: { display: true, text: this.translate.instant('analytics.creditLiquidity.chart.shareTitle') },
        },
      },
    });
  }
}
