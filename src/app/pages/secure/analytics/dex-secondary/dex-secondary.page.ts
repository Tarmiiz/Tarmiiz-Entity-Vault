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

// ─── Negotiated OTC (2026-08-08) ────────────────────────────────────────────
interface NegotiatedBucket {
  label: string;
  rfqDeals: number; rfqVolume: number; rfqNotional: number;
  bilateralDeals: number; bilateralVolume: number; bilateralNotional: number;
}
interface NegotiatedOutcomes {
  settled: number; rejected: number; withdrawn: number; venueRejected: number;
  expired: number; closed: number; settledPct: number;
}
interface RfqFunnel {
  requests: number; quoted: number; awarded: number; open: number;
  totalQuotes: number; responseRatePct: number; awardRatePct: number;
}

/**
 * Series colors, validated rather than eyeballed (dataviz check 3):
 * `#6366f1 / #d97706` clears the lightness band, the chroma floor, CVD separation
 * (ΔE 32.2 protan / 29.2 tritan — the target is ≥ 8) and 3:1 contrast against the
 * card surface. It keeps the app's indigo/amber identity; amber is one step darker
 * than the `#f59e0b` used elsewhere purely because that step fails the contrast
 * check at 2.09:1. Do not lighten it back.
 */
const C_RFQ = '#6366f1';
const C_BILATERAL = '#d97706';

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

      <!--
        The OTC counterpart of the card above: that one measures the anonymous BOOK,
        this measures the DESK. Three panels, and only ONE of them is a chart —
        the funnel and the outcome mix are counts and rates, which read better as
        figures than as pie slices nobody can compare.
      -->
      <app-analytics-card
        [title]="'analytics.negotiated.title' | translate"
        [subtitle]="'analytics.negotiated.subtitle' | translate"
        [loading]="negLoading()"
        [empty]="!negLoading() && !hasNegotiated()"
        [emptyMessage]="'analytics.negotiated.emptyMessage' | translate">

        <!-- RFQ funnel. Two rates, not one conversion number: "nobody answered" and
             "nobody's price was good enough" are different failures. -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div class="text-xs text-gray-500">{{ 'analytics.negotiated.funnel.requests' | translate }}</div>
            <div class="text-2xl font-semibold text-gray-900">{{ funnel().requests }}</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div class="text-xs text-gray-500">{{ 'analytics.negotiated.funnel.quoted' | translate }}</div>
            <div class="text-2xl font-semibold text-gray-900">{{ funnel().quoted }}</div>
            <div class="text-xs text-gray-500 mt-0.5">{{ pct(funnel().responseRatePct) }} {{ 'analytics.negotiated.funnel.responseRate' | translate }}</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div class="text-xs text-gray-500">{{ 'analytics.negotiated.funnel.awarded' | translate }}</div>
            <div class="text-2xl font-semibold text-gray-900">{{ funnel().awarded }}</div>
            <div class="text-xs text-gray-500 mt-0.5">{{ pct(funnel().awardRatePct) }} {{ 'analytics.negotiated.funnel.awardRate' | translate }}</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div class="text-xs text-gray-500">{{ 'analytics.negotiated.funnel.avgQuotes' | translate }}</div>
            <div class="text-2xl font-semibold text-gray-900">{{ avgQuotes() }}</div>
          </div>
        </div>

        <div class="h-72">
          <canvas #negChart></canvas>
        </div>

        <!-- Outcome mix over deals that REACHED a terminal state. Rows with counts +
             a proportion bar rather than a pie: five slices of similar size are
             exactly what a pie cannot be read for. -->
        <div class="mt-6">
          <div class="flex items-baseline justify-between mb-2">
            <h3 class="text-sm font-semibold text-gray-800">{{ 'analytics.negotiated.outcomes.title' | translate }}</h3>
            <span class="text-xs text-gray-500">
              {{ 'analytics.negotiated.outcomes.closedCount' | translate:{ n: outcomes().closed } }}
            </span>
          </div>
          @if (outcomes().closed > 0) {
            <div class="space-y-1.5">
              @for (row of outcomeRows(); track row.key) {
                <div class="flex items-center gap-3 text-xs">
                  <span class="w-32 shrink-0 text-gray-600">{{ row.labelKey | translate }}</span>
                  <div class="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div class="h-full rounded-full" [style.width.%]="row.pct" [style.background-color]="row.color"></div>
                  </div>
                  <span class="w-24 shrink-0 text-right text-gray-800 tabular-nums">{{ row.count }} · {{ pct(row.pct) }}</span>
                </div>
              }
            </div>
          } @else {
            <p class="text-xs text-gray-400 italic">{{ 'analytics.negotiated.outcomes.none' | translate }}</p>
          }
        </div>
      </app-analytics-card>
    </div>
  `,
})
export class DexSecondaryPage implements OnInit, OnDestroy {
  private apiService = inject(ApiService);
  private translate = inject(TranslateService);

  @ViewChild('chart') chartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('negChart') negChartRef?: ElementRef<HTMLCanvasElement>;

  interval      = signal<string>('1d');
  loading       = signal<boolean>(true);
  data          = signal<Record<string, DexAsset>>({});
  selectedAsset = signal<string | null>(null);
  assetCodes    = computed(() => Object.keys(this.data()));

  // Negotiated OTC — shares the interval selector with the book card above, since a
  // reader comparing the two wants the same window on both.
  negLoading = signal<boolean>(true);
  negBuckets = signal<NegotiatedBucket[]>([]);
  outcomes   = signal<NegotiatedOutcomes>({
    settled: 0, rejected: 0, withdrawn: 0, venueRejected: 0, expired: 0, closed: 0, settledPct: 0,
  });
  funnel = signal<RfqFunnel>({
    requests: 0, quoted: 0, awarded: 0, open: 0, totalQuotes: 0, responseRatePct: 0, awardRatePct: 0,
  });

  /** Empty only when there is nothing at all — a window with requests but no fills is real data. */
  hasNegotiated = computed(() =>
    this.outcomes().closed > 0
    || this.funnel().requests > 0
    || this.negBuckets().some(b => b.rfqDeals > 0 || b.bilateralDeals > 0));

  avgQuotes = computed(() => {
    const f = this.funnel();
    return f.requests > 0 ? (f.totalQuotes / f.requests).toFixed(1) : '0.0';
  });

  /**
   * The outcome mix as ordered rows. Settled first because it is the one everything
   * else is measured against; the four ways a negotiation ends without a trade follow
   * in the order an operator would ask about them.
   *
   * Grey for the non-settled outcomes on purpose: a withdrawn or expired deal is an
   * ordinary result, not a failure, and painting them red would say otherwise. Only
   * the venue's rejection gets a warning tone — it ends a deal both sides had agreed.
   */
  outcomeRows = computed(() => {
    const o = this.outcomes();
    const total = o.closed || 1;
    const rows = [
      { key: 'settled',       labelKey: 'analytics.negotiated.outcomes.settled',       count: o.settled,       color: '#059669' },
      { key: 'rejected',      labelKey: 'analytics.negotiated.outcomes.rejected',      count: o.rejected,      color: '#9ca3af' },
      { key: 'withdrawn',     labelKey: 'analytics.negotiated.outcomes.withdrawn',     count: o.withdrawn,     color: '#9ca3af' },
      { key: 'venueRejected', labelKey: 'analytics.negotiated.outcomes.venueRejected', count: o.venueRejected, color: '#d97706' },
      { key: 'expired',       labelKey: 'analytics.negotiated.outcomes.expired',       count: o.expired,       color: '#9ca3af' },
    ];
    return rows.map(r => ({ ...r, pct: (r.count / total) * 100 }));
  });

  pct(n: number) { return `${Number(n || 0).toFixed(1)}%`; }

  private chartInstance: any;
  private negChartInstance: any;

  async ngOnInit() { await Promise.all([this.load(), this.loadNegotiated()]); }
  ngOnDestroy() {
    this.chartInstance?.destroy();
    this.negChartInstance?.destroy();
  }

  async onInterval(v: string) {
    this.interval.set(v);
    await Promise.all([this.load(), this.loadNegotiated()]);
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

  private async loadNegotiated() {
    this.negLoading.set(true);
    try {
      const res = await this.apiService.vaultGetNegotiatedActivity(this.interval(), 30) as any;
      this.negBuckets.set((res?.buckets ?? []) as NegotiatedBucket[]);
      if (res?.outcomes) this.outcomes.set(res.outcomes as NegotiatedOutcomes);
      if (res?.rfqFunnel) this.funnel.set(res.rfqFunnel as RfqFunnel);
      setTimeout(() => this.renderNegotiated(), 50);
    } finally {
      this.negLoading.set(false);
    }
  }

  /**
   * Settled notional by provenance — RFQ-sourced vs bilateral, STACKED on ONE axis.
   *
   * Stacked rather than two-axis because both series are the same measure in the same
   * currency, so the total is meaningful and the mix is readable at a glance; a second
   * y-scale would invent a comparison that isn't there. Both series are named in the
   * legend, so identity never rests on color alone.
   */
  private async renderNegotiated() {
    if (!this.negChartRef?.nativeElement) return;
    const buckets = this.negBuckets();
    if (!buckets.length) { this.negChartInstance?.destroy(); this.negChartInstance = null; return; }

    const { Chart, registerables } = await import('chart.js') as any;
    Chart.register(...registerables);
    this.negChartInstance?.destroy();
    this.negChartInstance = new Chart(this.negChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: buckets.map(b => b.label),
        datasets: [
          {
            label: this.translate.instant('analytics.negotiated.chart.datasetRfq'),
            data: buckets.map(b => b.rfqNotional),
            backgroundColor: C_RFQ,
            // A 2px surface gap between stacked segments, so the boundary reads as a
            // boundary rather than as a shade change.
            borderColor: '#ffffff', borderWidth: 2, borderSkipped: false,
            borderRadius: 4,
          },
          {
            label: this.translate.instant('analytics.negotiated.chart.datasetBilateral'),
            data: buckets.map(b => b.bilateralNotional),
            backgroundColor: C_BILATERAL,
            borderColor: '#ffffff', borderWidth: 2, borderSkipped: false,
            borderRadius: 4,
          },
        ],
      } as any,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              // Deal COUNT alongside the notional: two fills of equal height can be one
              // large deal or twenty small ones, and the desk cares which.
              afterBody: (items: any[]) => {
                const b = buckets[items?.[0]?.dataIndex ?? -1];
                if (!b) return '';
                return this.translate.instant('analytics.negotiated.chart.dealCounts', {
                  rfq: b.rfqDeals, bilateral: b.bilateralDeals,
                });
              },
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
          y: {
            stacked: true, beginAtZero: true,
            title: { display: true, text: this.translate.instant('analytics.negotiated.chart.notionalAxis') },
          },
        },
      },
    });
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
