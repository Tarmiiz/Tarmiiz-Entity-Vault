import { Component, inject, OnInit, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
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
import { applyPdfFooter } from '../../../../shared/utils/pdf-export.utils';
import { ModalAssetStateService } from '../modals/modal-asset-state/modal-asset-state.service';
import { ModalAssetStateComponent } from "../modals/modal-asset-state/modal-asset-state.component";
import { ModalAssetAddServiceService } from '../modals/modal-asset-add-service/modal-asset-add-service.service';
import { ModalAssetAddServiceComponent } from '../modals/modal-asset-add-service/modal-asset-add-service.component';
import { ModalTransactionInfoService } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.component';
import { ModalAssetServiceStateService } from '../modals/modal-asset-service-state/modal-asset-service-state.service';
import { ModalAssetServiceStateComponent } from '../modals/modal-asset-service-state/modal-asset-service-state.component';
import { AuditService } from '../../../../shared/services/audit.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { DocumentsTabComponent } from '../../../../shared/components/documents-tab/documents-tab.component';
import { LiveIndicatorComponent } from '../../../../shared/components/live-indicator/live-indicator.component';
import { ModalListingCreateService } from '../../dex/asset-listings/modals/modal-listing-create/modal-listing-create.service';
import { ModalListingCreateComponent } from '../../dex/asset-listings/modals/modal-listing-create/modal-listing-create.component';
import { ModalAssetPriceService } from '../modals/modal-asset-price/modal-asset-price.service';
import { ModalAssetPriceComponent } from '../modals/modal-asset-price/modal-asset-price.component';
import { ModalAssetSupplyService } from '../modals/modal-asset-supply/modal-asset-supply.service';
import { ModalAssetSupplyComponent } from '../modals/modal-asset-supply/modal-asset-supply.component';
import { ModalAssetFeeConfigService } from '../modals/modal-asset-fee-config/modal-asset-fee-config.service';
import { ModalAssetFeeConfigComponent } from '../modals/modal-asset-fee-config/modal-asset-fee-config.component';
import { ModalDistributionDeclareService } from '../modals/modal-distribution-declare/modal-distribution-declare.service';
import { ModalDistributionDeclareComponent } from '../modals/modal-distribution-declare/modal-distribution-declare.component';
import { MetadataEditModalService } from '../../../../shared/components/metadata-edit-modal/metadata-edit-modal.service';
import { MetadataEditModalComponent } from '../../../../shared/components/metadata-edit-modal/metadata-edit-modal.component';
import { DexAssetListing, DexAssetListingVenue } from '../../../../shared/models/data.model';



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
    ModalAssetAddServiceComponent,
    ModalTransactionInfoComponent,
    ModalAssetServiceStateComponent,
    DocumentsTabComponent,
    LiveIndicatorComponent,
    ModalListingCreateComponent,
    ModalAssetPriceComponent,
    ModalAssetSupplyComponent,
    ModalAssetFeeConfigComponent,
    ModalDistributionDeclareComponent,
    MetadataEditModalComponent, TranslatePipe,
  ]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private assetStateService = inject(ModalAssetStateService);
  addServiceModal = inject(ModalAssetAddServiceService);
  private serviceStateModal = inject(ModalAssetServiceStateService);
  private listingCreateModal = inject(ModalListingCreateService);
  private priceModal = inject(ModalAssetPriceService);
  private supplyModal = inject(ModalAssetSupplyService);
  private feeConfigModal = inject(ModalAssetFeeConfigService);
  private metadataEditModal = inject(MetadataEditModalService);
  distributionDeclareModal = inject(ModalDistributionDeclareService);
  trxInfoService = inject(ModalTransactionInfoService);
  utils = inject(UtilsService);
  private socketService = inject(SocketService);
  private authService = inject(AuthService);
  private auditService = inject(AuditService);
  private features = inject(FeaturesService);

  userInfo!: User;
  get entityActive() { return this.authService.entityActive(); }
  private _socketSub: Subscription | null = null;

  @ViewChild('priceChart') priceChartRef!: ElementRef<HTMLCanvasElement>;

  activeTab = signal<'overview' | 'info' | 'metadata' | 'price' | 'holders' | 'trxs' | 'services' | 'docs' | 'dex' | 'distributions' | 'holdersAt'>('overview');

  // DEX listing state — populated lazily when the DEX tab opens.
  dexListing       = signal<DexAssetListing | undefined>(undefined);
  dexListingVenues = signal<DexAssetListingVenue[]>([]);
  dexListingLoaded = signal(false);

  // Distributions state — populated lazily when the Distributions tab opens.
  // distState codes: 1 Declared, 2 Executing, 3 Completed, 4 PartiallyCompleted.
  distributions       = signal<any[]>([]);
  distributionsLoaded = signal(false);
  distributionsLoading = signal(false);

  // Holders-at state — historical-balance reconstruction at a chosen block.
  // Driven by ITarmiizAsset.balanceOfAt (ERC20Votes checkpointed balances) +
  // the API's transaction-delta reconstruction of the holder set.
  holdersAtMode       = signal<'block' | 'date'>('block');
  holdersAtBlockInput = signal<string>('');
  holdersAtDateInput  = signal<string>('');   // yyyy-mm-dd from <input type="date">
  holdersAt           = signal<{ account: string; balance: string }[]>([]);
  holdersAtCount      = signal<number>(0);
  holdersAtLoading    = signal(false);
  holdersAtQueried    = signal<number | null>(null);
  holdersAtTime       = signal<number | null>(null);  // block timestamp (unix seconds)

  loadingData: boolean = false;
  refreshing = signal(false);

  assetAddress = '';
  asset = signal<Asset | undefined>(undefined);
  assetTotalWithheld = signal<number>(0);
  suspensionReason = signal<string>('');
  priceHistory = signal<AssetPrice[]>([]);
  newPriceTimestamps = signal<Set<number>>(new Set());
  pricePage = signal(0);
  readonly pricePageSize = 10;

  readonly intervalOptions: { value: string; label: string; seconds: number }[] = [
    { value: '1m',  label: '1 min',    seconds: 60 },
    { value: '5m',  label: '5 min',    seconds: 300 },
    { value: '15m', label: '15 min',   seconds: 900 },
    { value: '30m', label: '30 min',   seconds: 1800 },
    { value: '1h',  label: '1 hour',   seconds: 3600 },
    { value: '3h',  label: '3 hours',  seconds: 10800 },
    { value: '6h',  label: '6 hours',  seconds: 21600 },
    { value: '12h', label: '12 hours', seconds: 43200 },
    { value: '1d',  label: '1 day',    seconds: 86400 },
    { value: '3d',  label: '3 days',   seconds: 259200 },
    { value: '7d',  label: '7 days',   seconds: 604800 },
    { value: '15d', label: '15 days',  seconds: 1296000 },
    { value: '30d', label: '30 days',  seconds: 2592000 },
    { value: '60d', label: '60 days',  seconds: 5184000 },
    { value: '90d', label: '90 days',  seconds: 7776000 },
  ];
  priceInterval = signal<string>('5m');
  activeIntervalLabel = computed(() =>
    this.intervalOptions.find(i => i.value === this.priceInterval())?.label ?? this.priceInterval()
  );
  showWindowSuffix = computed(() => {
    const opt = this.intervalOptions.find(i => i.value === this.priceInterval());
    if (!opt) return true;
    // Drop the "Last 30 × X" suffix when the bucket is itself > 30 days —
    // multiplying by 30 in those cases produces a meaninglessly long window.
    return opt.seconds <= 30 * 86400 && opt.value !== '30d';
  });
  filteredPriceHistory = computed(() => {
    const opt = this.intervalOptions.find(i => i.value === this.priceInterval());
    const history = this.priceHistory();
    if (!opt || history.length === 0) return history;

    const now = Math.floor(Date.now() / 1000);
    const bucketSec = opt.seconds;
    const cutoff = now - bucketSec * 30;

    // Bucket points by interval. Each bucket's timestamp is its end time
    // (start + bucketSec). Aggregate bid/ask as the average within the bucket.
    const buckets = new Map<number, { sumBid: number; sumAsk: number; n: number }>();
    for (const p of history) {
      if (p.timestamp < cutoff) continue;
      const bucketStart = Math.floor(p.timestamp / bucketSec) * bucketSec;
      const bucketEnd = bucketStart + bucketSec;
      const b = buckets.get(bucketEnd) ?? { sumBid: 0, sumAsk: 0, n: 0 };
      b.sumBid += Number(p.bid) || 0;
      b.sumAsk += Number(p.ask) || 0;
      b.n += 1;
      buckets.set(bucketEnd, b);
    }

    return Array.from(buckets.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([ts, b]) => ({
        timestamp: ts,
        bid: b.sumBid / b.n,
        ask: b.sumAsk / b.n,
      })) as AssetPrice[];
  });

  filterPriceStartDate = signal<string>('');
  filterPriceEndDate = signal<string>('');
  filteredPriceTable = computed(() => {
    const startTs = this.filterPriceStartDate() ? Math.floor(new Date(this.filterPriceStartDate()).getTime() / 1000) : 0;
    const endTs   = this.filterPriceEndDate()   ? Math.floor(new Date(this.filterPriceEndDate()).getTime()   / 1000) + 86399 : Infinity;
    return this.priceHistory().filter(p => p.timestamp >= startTs && p.timestamp <= endTs);
  });
  pagedPriceHistory = computed(() => {
    const start = this.pricePage() * this.pricePageSize;
    return this.filteredPriceTable().slice(start, start + this.pricePageSize);
  });
  totalPricePages = computed(() => Math.ceil(this.filteredPriceTable().length / this.pricePageSize));

  clearPriceFilter() {
    this.filterPriceStartDate.set('');
    this.filterPriceEndDate.set('');
    this.pricePage.set(0);
  }

  exportPricesExcel() {
    const rows = this.filteredPriceTable().map(p => ({
      'Date': this.utils.formatDate(p.timestamp),
      'Bid': p.bid,
      'Ask': p.ask,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Prices');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `asset_prices_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'asset_prices');
  }

  exportPricesPdf() {
    const prices = this.filteredPriceTable();
    const asset = this.asset();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Prices — ${asset?.name ?? ''}`, pad, 15);

    const filterParts = [
      `From: ${this.filterPriceStartDate() || 'None'}`,
      `To: ${this.filterPriceEndDate() || 'None'}`,
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
      columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      head: [[
        { content: '#' },
        { content: 'Date' },
        { content: 'Bid', styles: { halign: 'right' } },
        { content: 'Ask', styles: { halign: 'right' } },
      ]],
      body: prices.map((p, i) => [
        i + 1,
        this.utils.formatDate(p.timestamp),
        this.utils.formatPrice(p.bid),
        this.utils.formatPrice(p.ask),
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`asset_prices_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'asset_prices');
  }

  isNewPriceBucket(bucketEnd: number): boolean {
    const newTs = this.newPriceTimestamps();
    if (newTs.size === 0) return false;
    const opt = this.intervalOptions.find(i => i.value === this.priceInterval());
    if (!opt) return newTs.has(bucketEnd);
    const bucketStart = bucketEnd - opt.seconds;
    for (const ts of newTs) if (ts >= bucketStart && ts < bucketEnd) return true;
    return false;
  }

  setPriceInterval(value: string) {
    this.priceInterval.set(value);
    this.pricePage.set(0);
    setTimeout(() => this.renderChart(), 50);
  }

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
  filterStartDate = signal<string>('');
  filterEndDate = signal<string>('');
  filterCurrency = signal<string>('');

  uniqueSubscriptions = computed(() =>
    [...new Set(this.transactions().filter(t => t.subscription).map(t => t.subscription))].sort()
  );
  uniqueServices = computed(() =>
    [...new Map(this.transactions().map(t => [t.service, t.serviceName])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );
  uniqueCurrencies = computed(() =>
    [...new Set(this.transactions().map(t => t.currencyCode).filter(Boolean))].sort()
  );

  filteredTransactions = computed(() => {
    const type = this.filterType();
    const subscription = this.filterSubscription();
    const service = this.filterService();
    const currency = this.filterCurrency();
    const op = this.filterTokensOp();
    const amt = this.filterTokensAmt();
    const startTs = this.filterStartDate() ? Math.floor(new Date(this.filterStartDate()).getTime() / 1000) : 0;
    const endTs   = this.filterEndDate()   ? Math.floor(new Date(this.filterEndDate()).getTime()   / 1000) + 86399 : Infinity;
    return this.transactions().filter(t => {
      if (type && t.trxType !== type) return false;
      if (subscription && t.subscription !== subscription) return false;
      if (service && t.service !== service) return false;
      if (currency && t.currencyCode !== currency) return false;
      if (op && amt !== null) {
        if (op === 'gt' && t.tokens <= amt) return false;
        if (op === 'lt' && t.tokens >= amt) return false;
      }
      if (t.time < startTs || t.time > endTs) return false;
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
  parsedMetadata = computed<{ description: string; entries: [string, string][]; raw: string; valid: boolean }>(() => {
    const raw = this.asset()?.metadata ?? '';
    if (!raw) return { description: '', entries: [], raw: '', valid: true };
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const description = typeof obj.description === 'string' ? obj.description : '';
        const entries = Object.entries(obj)
          .filter(([k]) => k !== 'description')
          .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string])
          .sort((a, b) => a[0].localeCompare(b[0]));
        return { description, entries, raw, valid: true };
      }
    } catch (_) { /* fall through */ }
    return { description: '', entries: [], raw, valid: false };
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
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.reload(true));
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  private async reload(silent = false) {
    if (silent) this.refreshing.set(true);
    try {
      await this.getAssetDetails(silent);
      await Promise.all([
        this.getPriceHistory(1, 500, silent),
        this.getHolders(1, 500, silent),
        this.getTransactions(1, 500, silent),
        this.loadDexListing(),
      ]);
    } finally {
      if (silent) this.refreshing.set(false);
    }
  }

  setTab(tab: 'overview' | 'info' | 'metadata' | 'price' | 'holders' | 'trxs' | 'services' | 'docs' | 'dex' | 'distributions' | 'holdersAt') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getAssetDetails();
    if (tab === 'services') this.getAssetDetails();
    if (tab === 'price') this.getPriceHistory(1, 500);
    if (tab === 'holders') this.getHolders(1, 500);
    if (tab === 'trxs') this.getTransactions(1, 500);
    if (tab === 'dex') this.loadDexListing();
    if (tab === 'distributions') this.loadDistributions();
    // 'holdersAt' is user-driven (needs a block number) — no auto-load on tab open.
  }

  async loadHoldersAt() {
    const dateMode = this.holdersAtMode() === 'date';
    let blk = 0;
    let tsSec = 0;
    if (dateMode) {
      const ds = this.holdersAtDateInput();
      if (!ds) { this.alertService.show('Invalid date', 'Pick a date.'); return; }
      // Interpret the picked day as END of that local day → holders "as of" that date.
      tsSec = Math.floor(new Date(ds + 'T23:59:59').getTime() / 1000);
      if (!tsSec || tsSec <= 0) { this.alertService.show('Invalid date', 'Pick a valid date.'); return; }
    } else {
      blk = Math.floor(Number(this.holdersAtBlockInput()));
      if (!blk || blk <= 0) { this.alertService.show('Invalid block', 'Enter a positive block number.'); return; }
    }
    this.holdersAtLoading.set(true);
    try {
      const r = dateMode
        ? await this.apiService.assetHoldersAtDate(this.assetAddress, tsSec, 0, 50)
        : await this.apiService.assetHoldersAt(this.assetAddress, blk, 0, 50);
      this.holdersAt.set(r?.holders ?? []);
      this.holdersAtCount.set(Number(r?.totalCount ?? 0));
      // The API echoes the effective (resolved) block — show that for both modes.
      this.holdersAtQueried.set(Number(r?.blockNumber ?? blk) || null);
      this.holdersAtTime.set(r?.blockTime != null ? Number(r.blockTime) : null);
    } finally {
      this.holdersAtLoading.set(false);
    }
  }

  async loadDistributions() {
    this.distributionsLoading.set(true);
    try {
      const data = await this.apiService.distributionsList(this.assetAddress, 1, 50);
      this.distributions.set(data?.distributions ?? []);
      this.distributionsLoaded.set(true);
    } finally {
      this.distributionsLoading.set(false);
    }
  }

  distStateName(state: number): string {
    switch (Number(state)) {
      case 1: return 'Declared';
      case 2: return 'Executing';
      case 3: return 'Completed';
      case 4: return 'Partially Completed';
      default: return 'Unknown';
    }
  }
  distTypeName(t: number): string {
    return Number(t) === 1 ? 'Credit Dividend' : Number(t) === 2 ? 'Stock Split' : 'Unknown';
  }

  async openDeclareDistribution() {
    const data = await this.distributionDeclareModal.show(this.assetAddress);
    if (!data) return;
    this.loadingService.show('Declaring distribution…');
    try {
      const r = await this.apiService.distributionDeclare(this.assetAddress, {
        distType:      data.distType,
        amount:        data.amount,
        recordBlock:   data.recordBlock,
        sweepResidual: data.sweepResidual,
      });
      if (!r || r.error) {
        this.alertService.show('Declare failed', r?.error || 'Could not declare distribution.');
      } else {
        this.alertService.show('Declared', `Distribution #${r.distribution?.distributionId} created.`);
        await this.loadDistributions();
      }
    } catch (e: any) {
      this.alertService.show('Error', e?.message || String(e));
    } finally {
      this.loadingService.hide();
    }
  }

  async executeDistribution(distributionId: number) {
    if (!confirm(`Execute all Pending legs for distribution #${distributionId}? This walks the holder set in chain-paginated chunks.`)) return;
    this.loadingService.show(`Executing #${distributionId}…`);
    try {
      const r = await this.apiService.distributionExecute(this.assetAddress, distributionId);
      if (!r || r.error) {
        this.alertService.show('Execute failed', r?.error || 'Could not execute distribution.');
      } else {
        this.alertService.show('Executed', `Sent ${r.result?.sent ?? 0} / Failed ${r.result?.failed ?? 0}.`);
        await this.loadDistributions();
      }
    } catch (e: any) {
      this.alertService.show('Error', e?.message || String(e));
    } finally {
      this.loadingService.hide();
    }
  }

  async finalizeDistribution(distributionId: number) {
    if (!confirm(`Finalize distribution #${distributionId}? Remaining Pending legs flip to Skipped; residual (if any, Credit-only) is refunded when sweep is enabled.`)) return;
    this.loadingService.show(`Finalizing #${distributionId}…`);
    try {
      const r = await this.apiService.distributionFinalize(this.assetAddress, distributionId);
      if (!r || r.error) {
        this.alertService.show('Finalize failed', r?.error || 'Could not finalize distribution.');
      } else {
        this.alertService.show('Finalized', `State: ${this.distStateName(r.result?.state)}.`);
        await this.loadDistributions();
      }
    } catch (e: any) {
      this.alertService.show('Error', e?.message || String(e));
    } finally {
      this.loadingService.hide();
    }
  }

  async loadDexListing() {
    // Skip entirely when DEX is disabled for this tenant — the API gates every
    // /dex/* endpoint with a 400 ('DEX is disabled'), so calling it just produces
    // console noise. Mark loaded + empty so the DEX tab stays hidden.
    if (!this.features.dex()) {
      this.dexListing.set(undefined);
      this.dexListingVenues.set([]);
      this.dexListingLoaded.set(true);
      return;
    }
    this.dexListingLoaded.set(false);
    try {
      const listing = await this.apiService.vaultDexAssetListingInfo(this.assetAddress);
      this.dexListing.set(listing);
      if (listing) {
        const r = await this.apiService.vaultDexAssetListingVenues(this.assetAddress);
        this.dexListingVenues.set(r?.venues || []);
      } else {
        this.dexListingVenues.set([]);
      }
    } finally { this.dexListingLoaded.set(true); }
  }

  async openDexListingCreate() {
    const result = await this.listingCreateModal.show({ presetAsset: this.assetAddress });
    if (!result) return;
    this.loadingService.show('Listing on DEX...');
    try {
      const r = await this.apiService.vaultDexAssetListingCreate(result.baseAsset, result.venue, result.country, result.global);
      if ((r as any)?.error) { this.alertService.show('Error', (r as any).error); return; }
      await this.loadDexListing();
    } finally { this.loadingService.hide(); }
  }

  goDexListing() { this.router.navigate(['/authorized/dex/asset-listings/details/' + this.assetAddress]); }

  dexTierLabel(t: number): string {
    return t === 1 ? 'Tier 1 — Venue' : t === 2 ? 'Tier 2 — Country' : t === 3 ? 'Tier 3 — Global' : '—';
  }
  dexTierBadgeClass(t: number): string {
    return t === 1 ? 'bg-indigo-100 text-indigo-800'
         : t === 2 ? 'bg-blue-100 text-blue-800'
         : t === 3 ? 'bg-purple-100 text-purple-800'
         : 'bg-gray-100 text-gray-800';
  }
  dexUpstreamBlockReason(): string {
    const l = this.dexListing(); if (!l) return '';
    const u = l.upstream;
    if (u && u.issuerEntityState && u.issuerEntityState !== 2) return 'Trading blocked — issuer entity not active';
    if (u && !u.assetTradable && u.syncedAt) return 'Trading blocked — asset suspended or inactive';
    return '';
  }

  private readonly stateNames: Record<number, string> = {
    0: 'Inactive', 1: 'Initiated', 2: 'Active', 3: 'Suspended', 4: 'Deactivated',
  };

  readonly serviceStateNames: Record<number, string> = {
    0: 'Unknown', 1: 'Pending', 2: 'Active', 3: 'Suspended', 4: 'Exit Only', 5: 'Deactivated',
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
      currencyCode: raw.currency_code_iso ?? '',
      currencyName: raw.currency_name ?? '',
      createdOn: raw.created_on ?? 0,
      services: (raw.services ?? []).map((s: string) => ({ service: s, serviceName: s, state: 0, stateName: '' })),
      issuer: raw.issuer ?? '',
      issuerName: raw.issuer_name ?? raw.issuer ?? '',
      manager: raw.manager ?? '',
      managerName: raw.manager_name ?? raw.manager ?? '',
      regulator: raw.regulator ?? '',
      regulatorName: raw.regulator_name ?? '',
      regulatorSymbol: '',
      suspended: raw.suspended === true || raw.suspended === 1,
      creditSettlement: raw.credit_settlement === true || raw.credit_settlement === 1,
      state: raw.state ?? 0,
      stateName: raw.asset_state_name ?? this.stateNames[raw.state] ?? String(raw.state ?? ''),
      priceMode: raw.priceMode ?? raw.price_mode ?? 2,
      priceModeName: raw.priceModeName ?? raw.price_mode_name ?? (Number(raw.priceMode ?? raw.price_mode ?? 2) === 1 ? 'Single' : 'Bid/Ask'),
      supplyMode: raw.supplyMode ?? raw.supply_mode ?? 1,
      supplyModeName: raw.supplyModeName ?? raw.supply_mode_name ?? (Number(raw.supplyMode ?? raw.supply_mode ?? 1) === 2 ? 'Dynamic' : 'Fixed'),
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
      currencyCode: raw.currency_code ?? '',
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

  async getAssetDetails(silent = false) {
    if (!silent) this.loadingService.show('Loading data...');
    const [raw, services, wheld] = await Promise.all([
      this.apiService.vaultGetAsset(this.assetAddress),
      this.apiService.vaultGetAssetServices(this.assetAddress),
      this.apiService.vaultGetAssetWithheldTotal(this.assetAddress).catch(() => null),
    ]);
    this.assetTotalWithheld.set(wheld?.totalWithheld ? Number(wheld.totalWithheld) : 0);
    if (raw) {
      const asset = this.mapVaultAsset(raw);
      if (services) {
        asset.services = services.map((s: any) => ({
          service: s.service,
          serviceName: s.service_name ?? s.service,
          state: s.state ?? 0,
          stateName: s.state_name ?? this.serviceStateNames[s.state] ?? 'Unknown',
          canQuote: !!(s.can_quote ?? s.canQuote ?? 0),
          feeConfig: s.fee_config ?? s.feeConfig ?? null,
        }));
      }
      this.asset.set(asset);
      if (asset.suspended) {
        const logs = await this.apiService.vaultGetStateChangeLogs(asset.address, 1, 1);
        if (logs?.logs?.length > 0) {
          this.suspensionReason.set(logs.logs[0].reason || '');
        }
      } else {
        this.suspensionReason.set('');
      }
    }
    if (!silent) this.loadingService.hide();
  }

  getTrxTypeClass(trxType: string): string {
    switch (trxType) {
      case 'Subscribe': return 'bg-green-100 text-green-800';
      case 'Redeem':    return 'bg-orange-100 text-orange-800';
      case 'Trade':     return 'bg-purple-100 text-purple-800';
      case 'Transfer':  return 'bg-blue-100 text-blue-800';
      default:          return 'bg-gray-100 text-gray-800';
    }
  }

  trxParty(trx: any): string {
    if (trx.trxType === 'Trade') {
      return `${this.shortAddr(trx.from)} → ${this.shortAddr(trx.to)}`;
    }
    return trx.subscription || '';
  }

  shortAddr(addr: string): string {
    if (!addr || addr.length < 14) return addr || '';
    return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
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

  getServiceStateClass(state: number): string {
    switch (state) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      case 5: return 'bg-gray-200 text-gray-600';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  async openServiceStateModal(serviceAddress: string, serviceName: string, currentState: number) {
    const result = await this.serviceStateModal.show({ serviceAddress, serviceName, currentState });
    if (result === null || result.state === currentState) return;
    this.loadingService.show('Updating service state...');
    try {
      const res = await this.apiService.vaultSetAssetServiceState(this.assetAddress, serviceAddress, result.state, result.reason);
      await this.getAssetDetails();
      if (res?.requestId) {
        this.alertService.show('Submitted for approval', 'A second operator must approve before this takes effect.', 'OK');
      }
    } catch (error) {
      console.error('Failed to change service state', error);
    } finally {
      this.loadingService.hide();
    }
  }

  feeModeName(mode: number | undefined): string {
    switch (Number(mode ?? 0)) {
      case 1: return 'Bps';
      case 2: return 'Fixed';
      default: return 'None';
    }
  }

  feeValueDisplay(mode: number | undefined, value: string | undefined): string {
    const m = Number(mode ?? 0);
    if (!m || !value) return '—';
    if (m === 1) return `${value} bps`;
    // Fixed: stored in wei → format to a human-readable decimal
    try {
      const raw = BigInt(value);
      const whole = raw / 10n ** 18n;
      const frac  = raw % 10n ** 18n;
      const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '');
      return fracStr ? `${whole}.${fracStr}` : `${whole}`;
    } catch { return value; }
  }

  async openFeeConfigModal(serviceAddress: string, serviceName: string) {
    const asset = this.asset();
    if (!asset) return;
    const res = await this.apiService.vaultGetAssetFeeConfig(this.assetAddress, serviceAddress);
    const current = res?.feeConfig ?? null;
    const result = await this.feeConfigModal.show({
      asset: this.assetAddress,
      assetSymbol: asset.symbol,
      service: serviceAddress,
      serviceName,
      feeConfig: current,
    });
    if (!result) return;
    this.loadingService.show('Saving fee config...');
    try {
      const r = await this.apiService.vaultSetAssetFeeConfig(this.assetAddress, serviceAddress, result.feeConfig);
      if ((r as any)?.error) {
        this.alertService.show('Error', (r as any).error);
        return;
      }
      await this.getAssetDetails();
    } finally {
      this.loadingService.hide();
    }
  }

  async toggleServiceCanQuote(serviceAddress: string, serviceName: string, currentlyAllowed: boolean) {
    const next = !currentlyAllowed;
    const title = next ? 'Allow Price Quoting' : 'Revoke Price Quoting';
    const message = next
      ? `Allow "${serviceName}" to set its own per-trade price on this asset? Trades placed through this service will clear at the price it supplies, not at your setPrice.`
      : `Pin "${serviceName}" to your asset price? Any per-trade price this service supplies will be ignored — trades will clear at your current bid/ask.`;
    const confirmed = await this.alertService.show(title, message, next ? 'Allow' : 'Pin');
    if (!confirmed) return;
    this.loadingService.show('Updating price-quoting permission...');
    try {
      await this.apiService.vaultSetAssetServiceCanQuote(this.assetAddress, serviceAddress, next);
      await this.getAssetDetails();
    } catch (error) {
      console.error('Failed to change service canQuote', error);
    } finally {
      this.loadingService.hide();
    }
  }

  async openChangeStateModal() {
    const currentAsset = this.asset();
    if (!currentAsset) return;

    const result = await this.assetStateService.show(currentAsset.state);
    if (result !== null && result.state !== currentAsset.state) {
      this.loadingService.show('Changing state...');
      try {
        const res = await this.apiService.vaultUpdateAssetState(currentAsset.address, result.state, result.reason);
        await this.getAssetDetails();
        if (res?.requestId) {
          this.alertService.show('Submitted for approval', 'A second operator must approve before this takes effect.', 'OK');
        }
      } catch (error) {
        console.error('Failed to change state', error);
      } finally {
        this.loadingService.hide();
      }
    }
  }

  async openEditMetadataModal() {
    const asset = this.asset();
    if (!asset) return;
    const pm = this.parsedMetadata();
    const result = await this.metadataEditModal.show({
      title: 'Edit Asset Metadata',
      description: pm.description,
      entries: pm.entries,
    });
    if (!result) return;
    this.loadingService.show('Updating metadata...');
    try {
      const res = await this.apiService.vaultUpdateAssetMetadata(asset.address, result);
      if (res?.error) {
        this.alertService.show('Error', res.error || 'Failed to update metadata.');
      } else {
        await this.getAssetDetails();
      }
    } catch (error) {
      console.error('Failed to update metadata', error);
      this.alertService.show('Error', 'An unexpected error occurred.');
    } finally {
      this.loadingService.hide();
    }
  }

  async openAddPriceModal() {
    const asset = this.asset();
    if (!asset) return;
    const lp = this.latestPrice();
    const result = await this.priceModal.show({
      priceMode: asset.priceMode,
      supplyMode: asset.supplyMode,
      symbol: asset.symbol,
      currentBid: lp?.bid,
      currentAsk: lp?.ask,
    });
    if (!result) return;
    this.loadingService.show('Saving price...');
    try {
      const r = await this.apiService.vaultSetAssetPrice({
        asset: this.assetAddress,
        bid: result.bid,
        ask: result.ask,
        timestamp: result.timestamp,
      });
      if ((r as any)?.error) {
        this.alertService.show('Error', (r as any).error);
        return;
      }
      await this.getPriceHistory(1, 500);
    } finally {
      this.loadingService.hide();
    }
  }

  // Mint / burn the asset's own treasury supply. Fixed-supply (supplyMode 1) only —
  // dynamic-supply tokens mint on subscribe / burn on redeem, so they have no manual
  // supply controls. Token quantities are plain integers (not wei).
  async openMintModal() {
    const asset = this.asset();
    if (!asset) return;
    const result = await this.supplyModal.show({ mode: 'mint', symbol: asset.symbol });
    if (!result) return;
    this.loadingService.show('Minting supply...');
    try {
      const r = await this.apiService.vaultMintAsset(this.assetAddress, result.tokens);
      if ((r as any)?.error) { this.alertService.show('Mint failed', (r as any).error); return; }
      await this.getAssetDetails();
    } finally {
      this.loadingService.hide();
    }
  }

  async openBurnModal() {
    const asset = this.asset();
    if (!asset) return;
    // Treasury balance available to burn = totalSupply - circulating (held by the contract itself).
    const available = Math.max(0, (asset.totalSupply ?? 0) - (asset.circulating ?? 0));
    const result = await this.supplyModal.show({ mode: 'burn', symbol: asset.symbol, available });
    if (!result) return;
    this.loadingService.show('Burning supply...');
    try {
      const r = await this.apiService.vaultBurnAsset(this.assetAddress, result.tokens);
      if ((r as any)?.error) { this.alertService.show('Burn failed', (r as any).error); return; }
      await this.getAssetDetails();
    } finally {
      this.loadingService.hide();
    }
  }

  async openAddServiceModal() {
    const asset = this.asset();
    if (!asset) return;
    const selected = await this.addServiceModal.show(asset.services.map(s => s.service));
    if (selected) {
      this.loadingService.show('Adding service...');
      try {
        await this.apiService.vaultAddAssetService(this.assetAddress, selected);
        await this.getAssetDetails();
      } finally {
        this.loadingService.hide();
      }
    }
  }

  async removeService(serviceAddress: string) {
    const svc = this.asset()?.services.find(s => s.service === serviceAddress);
    const label = svc?.serviceName ?? serviceAddress;
    const confirmed = await this.alertService.show(
      'Remove Service',
      `Are you sure you want to remove "${label}" from this asset?`,
      'Remove'
    );
    if (!confirmed) return;
    this.loadingService.show('Removing service...');
    try {
      await this.apiService.vaultRemoveAssetService(this.assetAddress, serviceAddress);
      await this.getAssetDetails();
    } finally {
      this.loadingService.hide();
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

  async getPriceHistory(start: number, offset: number, silent = false) {
    if (!silent) this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetAssetPriceHistory(this.assetAddress, start - 1, offset);
    const next = data?.history ?? [];
    if (!silent) this.loadingService.hide();

    // Skip the re-render if nothing has actually changed — avoids the chart flicker
    // every time a non-price-related vault:updated tick lands.
    const prev = this.priceHistory();
    const unchanged =
      prev.length === next.length &&
      (prev.length === 0 || prev[0]?.timestamp === next[0]?.timestamp);
    if (unchanged && silent) return;

    if (silent) {
      const prevTs = new Set(prev.map(p => p.timestamp));
      const added = next.filter((p: AssetPrice) => !prevTs.has(p.timestamp)).map((p: AssetPrice) => p.timestamp);
      if (added.length) {
        this.newPriceTimestamps.set(new Set(added));
        setTimeout(() => this.newPriceTimestamps.set(new Set()), 2000);
      }
    }

    this.priceHistory.set(next);
    this.pricePage.set(0);

    // Wait for Angular to render the canvas before drawing
    setTimeout(() => this.renderChart(), 50);
  }

  private async renderChart() {
    const history = this.filteredPriceHistory();
    if (!history || history.length === 0) {
      if (this.chartInstance) { this.chartInstance.destroy(); this.chartInstance = null; }
      return;
    }

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

  async getHolders(start: number, offset: number, silent = false) {
    if (!silent) this.loadingService.show('Loading data...');
    const [holdersData, priceData] = await Promise.all([
      this.apiService.vaultGetAssetHolders(this.assetAddress, start - 1, offset),
      this.apiService.vaultGetAssetPrice(this.assetAddress),
    ]);
    if (holdersData?.holders) this.holders.set(holdersData.holders);
    if (priceData?.bid) this.currentBid.set(priceData.bid);
    this.holderPage.set(0);
    if (!silent) this.loadingService.hide();
  }

  async getTransactions(start: number, offset: number, silent = false) {
    if (!silent) this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetTransactions({ asset: this.assetAddress }, start - 1, offset);
    if (data?.transactions) this.transactions.set(data.transactions.map((t: any) => this.mapVaultTransaction(t)));
    this.trxPage.set(0);
    if (!silent) this.loadingService.hide();
  }

  clearFilters() {
    this.filterType.set('');
    this.filterSubscription.set('');
    this.filterService.set('');
    this.filterCurrency.set('');
    this.filterTokensOp.set('');
    this.filterTokensAmt.set(null);
    this.filterStartDate.set('');
    this.filterEndDate.set('');
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
    this.auditService.logExport('excel', 'asset_holders');
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
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`asset_holders_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'asset_holders');
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
      `From: ${this.filterStartDate() || 'None'}`,
      `To: ${this.filterEndDate() || 'None'}`,
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
        5: { halign: 'center' },
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
        { content: 'Currency', styles: { halign: 'center' } },
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
        t.currencyCode,
        this.utils.formatTokens(t.tokens),
        this.utils.formatPrice(t.price),
        this.utils.formatPrice(t.totalPrice),
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`asset_transactions_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'asset_transactions');
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
    this.auditService.logExport('excel', 'asset_transactions');
  }

  showTransactionInfo(trx: AssetTransaction) {
    this.auditService.logView('transaction', { id: trx.trxId });
    this.trxInfoService.show(trx);
  }

  async gotoSubscription(subscription: string) {
    this.router.navigate(['/authorized/subscriptions/details/' + subscription]);
  }
}