import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AnalyticsCardComponent } from '../components/analytics-card.component';

interface Validator {
  address: string; name: string; activeSubs: number; sharePct: number;
}
interface Reliance {
  totalActiveSubs: number;
  validators: Validator[];
  singlePointOfFailure: boolean;
  topValidator: { address: string; name: string; sharePct: number } | null;
}

@Component({
  selector: 'app-analytics-operational-risk',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, HeaderComponent, AnalyticsCardComponent],
  template: `
    <app-header title="Operational Risk"></app-header>
    <div class="grow p-1 bg-gray-300 pt-4 overflow-y-auto">

      @if (data()?.singlePointOfFailure) {
        <div class="rounded-xl shadow-md border border-red-300 bg-red-50 p-4 mb-6 flex items-center gap-3">
          <svg class="w-6 h-6 text-red-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <div>
            <p class="text-sm font-semibold text-red-800">
              Single point of failure: {{ data()!.topValidator?.name }}
              ({{ data()!.topValidator?.sharePct | number:'1.0-1' }}% of active subscriptions)
            </p>
            <p class="text-xs text-red-700">Consider distributing subscriptions across additional validators to reduce concentration risk.</p>
          </div>
        </div>
      }

      <app-analytics-card
        title="Validator reliance"
        subtitle="Share of active subscriptions per validator. Threshold for single-point-of-failure flag is 70%."
        [loading]="loading()"
        [empty]="!loading() && (data()?.validators?.length ?? 0) === 0">
        <div class="grid md:grid-cols-2 gap-6">
          <div class="h-80">
            <canvas #chart></canvas>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th class="px-3 py-2 font-medium">Validator</th>
                  <th class="px-3 py-2 font-medium text-right">Active subs</th>
                  <th class="px-3 py-2 font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (v of data()?.validators ?? []; track v.address) {
                  <tr>
                    <td class="px-3 py-2">
                      <div class="font-medium text-gray-900">{{ v.name }}</div>
                      <div class="text-xs text-gray-500 break-all">{{ v.address }}</div>
                    </td>
                    <td class="px-3 py-2 text-right">{{ v.activeSubs }}</td>
                    <td class="px-3 py-2 text-right font-semibold">{{ v.sharePct | number:'1.0-1' }}%</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr class="border-t bg-gray-50">
                  <td class="px-3 py-2 font-semibold">Total active</td>
                  <td class="px-3 py-2 text-right font-semibold" colspan="2">{{ data()?.totalActiveSubs ?? 0 }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </app-analytics-card>
    </div>
  `,
})
export class OperationalRiskPage implements OnInit, OnDestroy {
  private apiService = inject(ApiService);

  @ViewChild('chart') chartRef?: ElementRef<HTMLCanvasElement>;

  loading = signal<boolean>(true);
  data    = signal<Reliance | null>(null);

  private chartInstance: any;

  async ngOnInit() { await this.load(); }
  ngOnDestroy() { this.chartInstance?.destroy(); }

  private async load() {
    this.loading.set(true);
    try {
      const res = await this.apiService.vaultGetValidatorReliance() as any;
      this.data.set(res as Reliance);
      setTimeout(() => this.render(), 50);
    } finally {
      this.loading.set(false);
    }
  }

  private async render() {
    if (!this.chartRef?.nativeElement) return;
    const d = this.data();
    if (!d || !d.validators.length) { this.chartInstance?.destroy(); this.chartInstance = null; return; }

    const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#fb923c'];
    const labels = d.validators.map(v => v.name);
    const values = d.validators.map(v => v.activeSubs);

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
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const v = d.validators[ctx.dataIndex];
                return ` ${v.name}: ${v.activeSubs} subs (${v.sharePct.toFixed(1)}%)`;
              },
            },
          },
        },
      },
    });
  }
}
