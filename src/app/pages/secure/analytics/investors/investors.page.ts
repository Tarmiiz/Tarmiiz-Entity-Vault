import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AnalyticsCardComponent } from '../components/analytics-card.component';

interface Row {
  address: string; name: string; symbol: string;
  circulating: number; top10Balance: number; top10Pct: number; holderCount: number;
}

@Component({
  selector: 'app-analytics-investors',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, HeaderComponent, AnalyticsCardComponent],
  template: `
    <app-header title="Investors / Holders"></app-header>
    <div class="grow p-1 bg-gray-300 pt-4 overflow-y-auto">
      <app-analytics-card
        title="Holder concentration"
        subtitle="Top-10 holders' share of circulating supply, per asset. Higher = more concentrated."
        [loading]="loading()"
        [empty]="!loading() && rows().length === 0">
        <div class="h-96">
          <canvas #chart></canvas>
        </div>
      </app-analytics-card>
    </div>
  `,
})
export class InvestorsPage implements OnInit, OnDestroy {
  private apiService = inject(ApiService);

  @ViewChild('chart') chartRef?: ElementRef<HTMLCanvasElement>;

  loading = signal<boolean>(true);
  rows    = signal<Row[]>([]);

  private chartInstance: any;

  async ngOnInit() {
    await this.load();
  }

  ngOnDestroy() { this.chartInstance?.destroy(); }

  private async load() {
    this.loading.set(true);
    try {
      const res = await this.apiService.vaultGetHolderConcentration() as any;
      this.rows.set((res?.assets ?? []) as Row[]);
      setTimeout(() => this.render(), 50);
    } finally {
      this.loading.set(false);
    }
  }

  private async render() {
    if (!this.chartRef?.nativeElement) return;
    const rows = this.rows();
    if (!rows.length) { this.chartInstance?.destroy(); this.chartInstance = null; return; }

    const labels = rows.map(r => `${r.symbol} — ${r.name}`);
    const values = rows.map(r => Number(r.top10Pct.toFixed(2)));
    const colors = values.map(v => v > 80 ? '#dc2626' : v > 60 ? '#f59e0b' : '#10b981');

    const { Chart, registerables } = await import('chart.js') as any;
    Chart.register(...registerables);
    this.chartInstance?.destroy();
    this.chartInstance = new Chart(this.chartRef.nativeElement, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Top-10 holders %', data: values, backgroundColor: colors }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const r = rows[ctx.dataIndex];
              return [
                `${ctx.parsed.x.toFixed(2)}% of supply`,
                `Holders: ${r.holderCount}`,
                `Top-10 balance: ${r.top10Balance.toLocaleString()}`,
              ];
            },
          },
        } },
        scales: {
          x: { beginAtZero: true, max: 100, title: { display: true, text: 'Top-10 % of circulating' } },
        },
      },
    });
  }
}
