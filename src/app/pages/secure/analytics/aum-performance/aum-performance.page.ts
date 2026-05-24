import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AnalyticsCardComponent } from '../components/analytics-card.component';
import { AnalyticsIntervalSelectComponent } from '../components/analytics-interval-select.component';

interface Bucket { label: string; aum: number; }

@Component({
  selector: 'app-analytics-aum-performance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, HeaderComponent, AnalyticsCardComponent, AnalyticsIntervalSelectComponent, TranslatePipe],
  template: `
    <app-header [title]="'analytics.aumPerformance.title' | translate"></app-header>
    <div class="grow p-1 bg-gray-300 pt-4 overflow-y-auto">
      <app-analytics-card
        title="Assets Under Management"
        subtitle="Stacked by currency. circulating × latest bid at each bucket."
        [loading]="loading()"
        [empty]="!loading() && !hasData()">
        <app-analytics-interval-select card-actions
          [value]="interval()"
          (valueChange)="onInterval($event)">
        </app-analytics-interval-select>
        <div class="h-80">
          <canvas #chart></canvas>
        </div>
      </app-analytics-card>
    </div>
  `,
})
export class AumPerformancePage implements OnInit, OnDestroy {
  private apiService = inject(ApiService);

  @ViewChild('chart') chartRef?: ElementRef<HTMLCanvasElement>;

  interval = signal<string>('1d');
  loading  = signal<boolean>(true);
  data     = signal<Record<string, Bucket[]>>({});

  hasData() { return Object.keys(this.data()).length > 0; }

  private chartInstance: any;

  async ngOnInit() {
    await this.load();
  }

  ngOnDestroy() {
    this.chartInstance?.destroy();
  }

  async onInterval(v: string) {
    this.interval.set(v);
    await this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      const res = await this.apiService.vaultGetAumTrend(this.interval(), 30) as any;
      this.data.set(res?.dataByCurrency ?? {});
      setTimeout(() => this.render(), 50);
    } finally {
      this.loading.set(false);
    }
  }

  private async render() {
    if (!this.chartRef?.nativeElement) return;
    const dataByCurrency = this.data();
    const codes = Object.keys(dataByCurrency);
    if (!codes.length) { this.chartInstance?.destroy(); this.chartInstance = null; return; }

    const labels = dataByCurrency[codes[0]].map(b => b.label);
    const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];
    const datasets = codes.map((code, i) => ({
      label: code,
      data: dataByCurrency[code].map(b => b.aum),
      backgroundColor: palette[i % palette.length] + '55',
      borderColor: palette[i % palette.length],
      fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2,
      stack: 'aum',
    }));

    const { Chart, registerables } = await import('chart.js') as any;
    Chart.register(...registerables);
    this.chartInstance?.destroy();
    this.chartInstance = new Chart(this.chartRef.nativeElement, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true, stacked: true, title: { display: true, text: 'AUM (currency value)' } },
        },
      },
    });
  }
}
