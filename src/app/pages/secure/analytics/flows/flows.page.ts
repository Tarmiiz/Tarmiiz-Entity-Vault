import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AnalyticsCardComponent } from '../components/analytics-card.component';
import { AnalyticsIntervalSelectComponent } from '../components/analytics-interval-select.component';

interface Bucket {
  label: string;
  subscribeTokens: number; redeemTokens: number; netTokens: number;
  subscribeValue: number;  redeemValue: number;  netValue: number;
}

@Component({
  selector: 'app-analytics-flows',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, HeaderComponent, AnalyticsCardComponent, AnalyticsIntervalSelectComponent, TranslatePipe],
  template: `
    <app-header [title]="'analytics.flows.title' | translate"></app-header>
    <div class="grow p-1 bg-gray-300 pt-4 overflow-y-auto">
      <app-analytics-card
        title="Net flow (subscribe vs redeem)"
        subtitle="Token volume per bucket. Bars = volume; line = net (subscribe − redeem)."
        [loading]="loading()"
        [empty]="!loading() && currencies().length === 0">
        <div card-actions class="flex items-center gap-3">
          @if (currencies().length > 1) {
            <label class="inline-flex items-center gap-2 text-sm text-gray-700">
              <span class="font-medium">Currency</span>
              <select class="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                      [ngModel]="selectedCurrency()"
                      (ngModelChange)="onCurrency($event)">
                @for (c of currencies(); track c) {
                  <option [value]="c">{{ c }}</option>
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
export class FlowsPage implements OnInit, OnDestroy {
  private apiService = inject(ApiService);

  @ViewChild('chart') chartRef?: ElementRef<HTMLCanvasElement>;

  interval         = signal<string>('1d');
  loading          = signal<boolean>(true);
  data             = signal<Record<string, Bucket[]>>({});
  selectedCurrency = signal<string | null>(null);
  currencies       = computed(() => Object.keys(this.data()));

  private chartInstance: any;

  async ngOnInit() { await this.load(); }
  ngOnDestroy() { this.chartInstance?.destroy(); }

  async onInterval(v: string) {
    this.interval.set(v);
    await this.load();
  }

  onCurrency(code: string) {
    this.selectedCurrency.set(code);
    setTimeout(() => this.render(), 50);
  }

  private async load() {
    this.loading.set(true);
    try {
      const res = await this.apiService.vaultGetNetFlow(this.interval(), 30) as any;
      const d = (res?.dataByCurrency ?? {}) as Record<string, Bucket[]>;
      this.data.set(d);
      const codes = Object.keys(d);
      if (!this.selectedCurrency() || !codes.includes(this.selectedCurrency()!)) {
        this.selectedCurrency.set(codes[0] ?? null);
      }
      setTimeout(() => this.render(), 50);
    } finally {
      this.loading.set(false);
    }
  }

  private async render() {
    if (!this.chartRef?.nativeElement) return;
    const code = this.selectedCurrency();
    if (!code) { this.chartInstance?.destroy(); this.chartInstance = null; return; }
    const buckets = this.data()[code] ?? [];

    const labels = buckets.map(b => b.label);
    const sub = buckets.map(b => b.subscribeTokens);
    const red = buckets.map(b => -b.redeemTokens);
    const net = buckets.map(b => b.netTokens);

    const { Chart, registerables } = await import('chart.js') as any;
    Chart.register(...registerables);
    this.chartInstance?.destroy();
    this.chartInstance = new Chart(this.chartRef.nativeElement, {
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Subscribe (tokens)', data: sub, backgroundColor: 'rgba(16,185,129,0.55)', borderColor: 'rgba(16,185,129,1)', borderWidth: 1, stack: 'flow' },
          { type: 'bar', label: 'Redeem (tokens)',    data: red, backgroundColor: 'rgba(239,68,68,0.55)',  borderColor: 'rgba(239,68,68,1)',  borderWidth: 1, stack: 'flow' },
          { type: 'line', label: 'Net (tokens)', data: net, borderColor: 'rgba(99,102,241,1)', backgroundColor: 'rgba(99,102,241,0.15)', tension: 0.3, pointRadius: 2, borderWidth: 2 },
        ],
      } as any,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' }, title: { display: true, text: `Currency: ${code}` } },
        scales: {
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { title: { display: true, text: 'Tokens (signed: redeem negative)' } },
        },
      },
    });
  }
}
