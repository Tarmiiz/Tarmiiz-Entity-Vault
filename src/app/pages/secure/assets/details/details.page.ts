import { Component, inject, OnInit, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
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
import { Asset, AssetHolder, AssetPrice, AssetTransaction, User, ContactInfo } from '../../../../shared/models/data.model';
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
import { TabsComponent, TabDef } from '../../../../shared/components/tabs/tabs.component';
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';
import { DocumentsTabComponent } from '../../../../shared/components/documents-tab/documents-tab.component';
import { ComplianceTabComponent } from './compliance-tab/compliance-tab.component';
import { LiveIndicatorComponent } from '../../../../shared/components/live-indicator/live-indicator.component';
import { ModalListingCreateService } from '../../dex/asset-listings/modals/modal-listing-create/modal-listing-create.service';
import { ModalListingCreateComponent } from '../../dex/asset-listings/modals/modal-listing-create/modal-listing-create.component';
import { ModalAssetPriceService } from '../modals/modal-asset-price/modal-asset-price.service';
import { ModalAssetPriceComponent } from '../modals/modal-asset-price/modal-asset-price.component';
import { ModalDealingConfigService, DealingConfig, DealingSide } from '../modals/modal-dealing-config/modal-dealing-config.service';
import { ModalDealingConfigComponent } from '../modals/modal-dealing-config/modal-dealing-config.component';
import { ModalAttestationService } from '../modals/modal-attestation/modal-attestation.service';
import { ModalAttestationComponent } from '../modals/modal-attestation/modal-attestation.component';
import { ModalAssetSupplyService } from '../modals/modal-asset-supply/modal-asset-supply.service';
import { ModalAssetSupplyComponent } from '../modals/modal-asset-supply/modal-asset-supply.component';
import { ModalDistributionDeclareService } from '../modals/modal-distribution-declare/modal-distribution-declare.service';
import { ModalDistributionDeclareComponent } from '../modals/modal-distribution-declare/modal-distribution-declare.component';
import { MetadataEditModalService } from '../../../../shared/components/metadata-edit-modal/metadata-edit-modal.service';
import { MetadataEditModalComponent } from '../../../../shared/components/metadata-edit-modal/metadata-edit-modal.component';
import { ModalIdentifierService } from '../../../../shared/components/modal-identifier/modal-identifier.service';
import { ModalIdentifierComponent } from '../../../../shared/components/modal-identifier/modal-identifier.component';
import { GlobalVariable, toGlobalVariables } from '../../../../shared/models/data.model';
import { ModalAssetImageAddService } from '../modals/modal-asset-image-add/modal-asset-image-add.service';
import { ModalAssetImageAddComponent } from '../modals/modal-asset-image-add/modal-asset-image-add.component';
import { ModalAssetPublicViewService } from '../modals/modal-asset-public-view/modal-asset-public-view.service';
import { ModalAssetPublicViewComponent } from '../modals/modal-asset-public-view/modal-asset-public-view.component';
import { DexAssetListing, DexAssetListingVenue } from '../../../../shared/models/data.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { RefreshButtonComponent } from '../../../../shared/components/refresh-button/refresh-button.component';
import { PaginatorComponent, pageSlice } from '../../../../shared/components/paginator/paginator.component';

// Entry inside the asset metadata's server-owned `media` key (public docs/images index).
export interface AssetMediaEntry { documentId: number; cid: string; title: string; fileType: string; }
// Entry inside the asset metadata's server-owned `identifiers` key (ISIN, …). Unlike an
// entity identifier there is no on-chain hash to reconcile against — the metadata IS the
// record — so there is no "bound / out of sync" state to render here.
export interface AssetIdentifier { idType: number; name: string; value: string; }
export interface AssetMedia {
  avatar?: AssetMediaEntry;
  banner?: AssetMediaEntry;
  images?: AssetMediaEntry[];
  documents?: AssetMediaEntry[];
}



@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [RefreshButtonComponent, TabsComponent, LoadingStateComponent,
    CommonModule, FormsModule,
    HeaderComponent,
    RouterLink,
    ModalAssetStateComponent,
    ModalAssetAddServiceComponent,
    ModalTransactionInfoComponent,
    ModalAssetServiceStateComponent,
    DocumentsTabComponent,
    ComplianceTabComponent,
    LiveIndicatorComponent,
    ModalListingCreateComponent,
    ModalAssetPriceComponent,
    ModalDealingConfigComponent,
    ModalAttestationComponent,
    ModalAssetSupplyComponent,
    ModalDistributionDeclareComponent,
    MetadataEditModalComponent,
    ModalIdentifierComponent,
    ModalAssetImageAddComponent,
    ModalAssetPublicViewComponent, TranslatePipe, MoneyPipe,
    PaginatorComponent,
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
  private dealingModal = inject(ModalDealingConfigService);
  private attestationModal = inject(ModalAttestationService);
  private supplyModal = inject(ModalAssetSupplyService);
  private metadataEditModal = inject(MetadataEditModalService);
  private identifierModal = inject(ModalIdentifierService);
  private imageAddModal = inject(ModalAssetImageAddService);
  private publicViewModal = inject(ModalAssetPublicViewService);
  distributionDeclareModal = inject(ModalDistributionDeclareService);
  trxInfoService = inject(ModalTransactionInfoService);
  utils = inject(UtilsService);
  private socketService = inject(SocketService);
  private authService = inject(AuthService);
  private auditService = inject(AuditService);
  features = inject(FeaturesService);
  private translate = inject(TranslateService);

  userInfo!: User;
  get entityActive() { return this.authService.entityActive(); }

  /**
   * True when this entity's template is the asset's on-chain `manager` — the
   * address the Entity API relays writes as. TarmiizT20 gates setMetadata /
   * setPrice / addService / setServiceCanQuote / setFeeConfig / setServiceState
   * (and mint / burn / changeState) on a strict equality with it, so every one
   * of those reverts otherwise. Used to hide those controls rather than render
   * them and relay a doomed transaction.
   *
   * A capability hint only — the contract is the enforcement. Deliberately does
   * NOT cover the media/images, DEX-listing or distribution actions: those are
   * issuer-gated, not manager-gated, and stay available to a non-manager owner.
   */
  canManage(): boolean { return this.asset()?.canManage === true; }
  private _socketSub: Subscription | null = null;
  private _langSub: Subscription | null = null;

  @ViewChild('priceChart') priceChartRef!: ElementRef<HTMLCanvasElement>;

  activeTab = signal<'overview' | 'info' | 'registration' | 'metadata' | 'price' | 'holders' | 'trxs' | 'services' | 'docs' | 'dex' | 'distributions' | 'holdersAt'>('overview');

  /**
   * The top tab bar (Standard 2). Twelve tabs — the most of any page in either
   * dashboard, which is why the shared component's `overflow-x-auto` matters
   * here: the hand-rolled recipe this replaced was a bare `flex` and squashed
   * them on a narrow window.
   *
   * Two are conditional and both conditions are preserved exactly:
   *   · Documents — the `view-documents` System Function.
   *   · DEX — shown while the listing is still loading OR once one is known to
   *     exist. That deliberate `!loaded() || listing()` shape means the tab does
   *     not flicker out and back in during the lazy load; do not "simplify" it
   *     to `listing()`, which would hide the tab until the fetch returns.
   */
  tabs = computed<TabDef[]>(() => {
    const out: TabDef[] = [
      { key: 'overview',     label: 'assets.details.tabs.overview' },
      { key: 'info',         label: 'assets.details.tabs.info' },
      { key: 'registration', label: 'assets.details.compliance.tab' },
      { key: 'metadata',     label: 'common.metadata' },
      { key: 'services',     label: 'assets.details.tabs.services' },
      { key: 'price',        label: 'assets.details.tabs.price' },
      { key: 'holders',      label: 'assets.details.tabs.holders' },
      { key: 'trxs',         label: 'assets.details.tabs.transactions' },
    ];
    if (this.features.systemFunctionEnabled('view-documents')) {
      out.push({ key: 'docs', label: 'assets.details.tabs.documents' });
    }
    if (!this.dexListingLoaded() || this.dexListing()) {
      out.push({ key: 'dex', label: 'assets.details.tabs.dex' });
    }
    out.push({ key: 'distributions', label: 'assets.details.tabs.distributions' });
    out.push({ key: 'holdersAt',     label: 'assets.details.tabs.holdersAtBlock' });
    return out;
  });

  // DEX listing state — populated lazily when the DEX tab opens.
  dexListing       = signal<DexAssetListing | undefined>(undefined);
  dexListingVenues = signal<DexAssetListingVenue[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  dexVenuesPage = signal(1);
  dexVenuesPageSize = signal(25);
  pagedDexVenues = computed(() => pageSlice(this.dexListingVenues(), this.dexVenuesPage(), this.dexVenuesPageSize()));
  dexListingLoaded = signal(false);

  // Distributions state — populated lazily when the Distributions tab opens.
  // distState codes: 1 Declared, 2 Executing, 3 Completed, 4 PartiallyCompleted.
  distributions       = signal<any[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  distributionsPage = signal(1);
  distributionsPageSize = signal(25);
  pagedDistributions = computed(() => pageSlice(this.distributions(), this.distributionsPage(), this.distributionsPageSize()));
  distributionsLoaded = signal(false);
  distributionsLoading = signal(false);

  // Holders-at state — historical-balance reconstruction at a chosen block.
  // Driven by ITarmiizAsset.ownedAt (the A6 record-date entitlement read, which
  // answers the same for a direct and a custodial holder — NOT balanceOfAt, whose
  // ERC20Votes checkpoints belong to the custodian) + the API's membership-ledger
  // reconstruction of the holder set.
  holdersAtMode       = signal<'block' | 'date'>('block');
  holdersAtBlockInput = signal<string>('');
  holdersAtDateInput  = signal<string>('');   // yyyy-mm-dd from <input type="date">
  holdersAt           = signal<{ account: string; balance: string | null }[]>([]);
  holdersAtCount      = signal<number>(0);
  holdersAtLoading    = signal(false);
  holdersAtQueried    = signal<number | null>(null);
  holdersAtTime       = signal<number | null>(null);  // block timestamp (unix seconds)
  chainHead           = signal<number | null>(null);  // latest block — caps the block input

  // Balances arrive as decimal STRINGS (they are uint256 on the wire). Parse once
  // here so the table, the total and both exports all read the same numbers.
  /** 1-based, per frontend Standard 1.5. */
  holdersAtPage = signal(1);
  holdersAtPageSize = signal(25);
  pagedHoldersAt = computed(() => pageSlice(this.holdersAtRows(), this.holdersAtPage(), this.holdersAtPageSize()));
  holdersAtRows = computed(() => this.holdersAt().map(h => ({
    account: h.account,
    balance: h.balance === null || h.balance === '' ? null : Number(h.balance),
  })));
  // Token quantities are plain integers platform-wide, so a plain sum is correct.
  holdersAtTotal = computed(() => this.holdersAtRows().reduce((sum, r) => sum + (r.balance ?? 0), 0));

  loadingData: boolean = false;
  refreshing = signal(false);

  assetAddress = '';
  asset = signal<Asset | undefined>(undefined);
  assetTotalWithheld = signal<number>(0);
  suspensionReason = signal<string>('');
  priceHistory = signal<AssetPrice[]>([]);
  newPriceTimestamps = signal<Set<number>>(new Set());
  pricePage = signal(1);
  pricePageSize = signal(25);

  readonly intervalOptions: { value: string; label: string; seconds: number }[] = [
    { value: '1m',  label: this.translate.instant('assets.details.price.intervals.oneMin'),    seconds: 60 },
    { value: '5m',  label: this.translate.instant('assets.details.price.intervals.fiveMin'),    seconds: 300 },
    { value: '15m', label: this.translate.instant('assets.details.price.intervals.fifteenMin'), seconds: 900 },
    { value: '30m', label: this.translate.instant('assets.details.price.intervals.thirtyMin'),  seconds: 1800 },
    { value: '1h',  label: this.translate.instant('assets.details.price.intervals.oneHour'),    seconds: 3600 },
    { value: '3h',  label: this.translate.instant('assets.details.price.intervals.threeHours'), seconds: 10800 },
    { value: '6h',  label: this.translate.instant('assets.details.price.intervals.sixHours'),   seconds: 21600 },
    { value: '12h', label: this.translate.instant('assets.details.price.intervals.twelveHours'),seconds: 43200 },
    { value: '1d',  label: this.translate.instant('assets.details.price.intervals.oneDay'),     seconds: 86400 },
    { value: '3d',  label: this.translate.instant('assets.details.price.intervals.threeDays'),  seconds: 259200 },
    { value: '7d',  label: this.translate.instant('assets.details.price.intervals.sevenDays'),  seconds: 604800 },
    { value: '15d', label: this.translate.instant('assets.details.price.intervals.fifteenDays'),seconds: 1296000 },
    { value: '30d', label: this.translate.instant('assets.details.price.intervals.thirtyDays'), seconds: 2592000 },
    { value: '60d', label: this.translate.instant('assets.details.price.intervals.sixtyDays'),  seconds: 5184000 },
    { value: '90d', label: this.translate.instant('assets.details.price.intervals.ninetyDays'), seconds: 7776000 },
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
  pagedPriceHistory = computed(() => pageSlice(this.filteredPriceTable(), this.pricePage(), this.pricePageSize()));

  clearPriceFilter() {
    this.filterPriceStartDate.set('');
    this.filterPriceEndDate.set('');
    this.pricePage.set(1);
  }

  exportPricesExcel() {
    // Same price-mode branch as the table: one Price / NAV column for a fixed-priced asset.
    const single = this.asset()?.priceMode === 1;
    const rows = this.filteredPriceTable().map(p => (single
      ? { 'Date': this.utils.formatDate(p.timestamp), 'Price / NAV': this.utils.roundMoney(p.bid) }
      : { 'Date': this.utils.formatDate(p.timestamp), 'Bid': this.utils.roundMoney(p.bid), 'Ask': this.utils.roundMoney(p.ask) }));
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

    const single = asset?.priceMode === 1;
    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      head: [single
        ? [{ content: '#' }, { content: 'Date' }, { content: 'Price / NAV', styles: { halign: 'right' } }]
        : [{ content: '#' }, { content: 'Date' }, { content: 'Bid', styles: { halign: 'right' } }, { content: 'Ask', styles: { halign: 'right' } }]],
      body: prices.map((p, i) => single
        ? [i + 1, this.utils.formatDate(p.timestamp), this.utils.formatPrice(p.bid)]
        : [i + 1, this.utils.formatDate(p.timestamp), this.utils.formatPrice(p.bid), this.utils.formatPrice(p.ask)]),
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
    this.pricePage.set(1);
    setTimeout(() => this.renderChart(), 50);
  }

  private chartInstance: any = null;

  holders = signal<AssetHolder[]>([]);
  currentBid = signal<number>(0);
  holderPage = signal(1);
  holderPageSize = signal(25);
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
  pagedHolders = computed(() => pageSlice(this.filteredHolders(), this.holderPage(), this.holderPageSize()));

  transactions = signal<AssetTransaction[]>([]);
  trxPage = signal(1);
  trxPageSize = signal(25);

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

  pagedTransactions = computed(() => pageSlice(this.filteredTransactions(), this.trxPage(), this.trxPageSize()));

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
  parsedMetadata = computed<{ description: string; contact: ContactInfo; entries: [string, string][]; media: AssetMedia | null; identifiers: AssetIdentifier[]; dealing: DealingConfig | null; raw: string; valid: boolean }>(() => {
    const raw = this.asset()?.metadata ?? '';
    const emptyContact: ContactInfo = { email: '', phone: '', website: '', address: '' };
    if (!raw) return { description: '', contact: emptyContact, entries: [], media: null, identifiers: [], dealing: null, raw: '', valid: true };
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const description = typeof obj.description === 'string' ? obj.description : '';
        // `contact` (nested public contact info) is rendered in its own section, excluded from
        // the free-form KV table. Legacy flat contact keys fall back into it and are also excluded.
        const c = (obj.contact && typeof obj.contact === 'object' && !Array.isArray(obj.contact)) ? obj.contact : {};
        const contact: ContactInfo = {
          email:   c.email   ?? obj.email   ?? '',
          phone:   c.phone   ?? obj.telephone ?? obj.mobile ?? '',
          website: c.website ?? obj.website ?? '',
          address: c.address ?? obj.address ?? '',
        };
        // `media` is the server-owned public docs/images index — rendered by the Images
        // section, excluded from the free-form key/value table (like `description`).
        const media = (obj.media && typeof obj.media === 'object' && !Array.isArray(obj.media)) ? obj.media as AssetMedia : null;
        // `identifiers` is the server-owned security-identifier array (ISIN, …) — rendered by
        // its own section, so it must be excluded from the free-form KV table or an ISIN
        // would show up twice, once of them as raw JSON.
        const identifiers: AssetIdentifier[] = Array.isArray(obj.identifiers)
          ? obj.identifiers
              .filter((e: any) => e && typeof e === 'object')
              .map((e: any) => ({ idType: Number(e.idType) || 0, name: String(e.name ?? ''), value: String(e.value ?? '') }))
              .filter((e: AssetIdentifier) => e.idType > 0)
              .sort((a: AssetIdentifier, b: AssetIdentifier) => a.idType - b.idType)
          : [];
        // `dealing` (Phase 36 A.7) is the server-owned forward-pricing model — its own section,
        // excluded from the free-form table like the other reserved keys. Read leniently: the
        // API validated it at the write, and the section renders what is there.
        const d = obj.dealing;
        const dealing: DealingConfig | null = (d && typeof d === 'object' && !Array.isArray(d) && d.buy && d.sell)
          ? { tz: String(d.tz ?? ''), valuationTime: String(d.valuationTime ?? ''), buy: d.buy as DealingSide, sell: d.sell as DealingSide }
          : null;
        const RESERVED = new Set(['description', 'media', 'contact', 'identifiers', 'dealing', 'email', 'telephone', 'mobile', 'website', 'address']);
        const entries = Object.entries(obj)
          .filter(([k]) => !RESERVED.has(k))
          .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string])
          .sort((a, b) => a[0].localeCompare(b[0]));
        return { description, contact, entries, media, identifiers, dealing, raw, valid: true };
      }
    } catch (_) { /* fall through */ }
    return { description: '', contact: emptyContact, entries: [], media: null, identifiers: [], dealing: null, raw, valid: false };
  });

  // ─── Dealing model (metadata tab, Phase 36 A.7) ──────────────────────────────
  // Same authority as Edit Metadata (the key rides the same blob and the same route family),
  // so the same System Function gates it.
  canEditDealing(): boolean {
    return this.canManage()
      && this.userInfo?.role !== 3
      && this.features.systemFunctionEnabled('asset-edit-metadata');
  }

  /** "daily · cut-off 10:00" / "MON · cut-off 12:00 (day before)" for the card. */
  describeDealingSide(side: DealingSide | undefined): string {
    if (!side) return '';
    const days = side.days === 'daily'
      ? this.translate.instant('assets.details.dealing.daily')
      : (Array.isArray(side.days) ? side.days.join(', ') : '');
    const cutoff = this.translate.instant('assets.details.dealing.cutoff', { time: side.cutoff });
    const before = side.cutoffDayBefore ? ' ' + this.translate.instant('assets.details.dealing.dayBefore') : '';
    return `${days} · ${cutoff}${before}`;
  }

  async openDealingModal() {
    const asset = this.asset();
    if (!asset) return;
    const current = this.parsedMetadata().dealing;
    const result = await this.dealingModal.show(asset.symbol, current);
    if (!result) return;
    if ('clear' in result) {
      const ok = await this.alertService.show(
        this.translate.instant('assets.details.dealing.clearTitle'),
        this.translate.instant('assets.details.dealing.clearMessage', { symbol: asset.symbol }),
        this.translate.instant('assets.dealingModal.clear'));
      if (!ok) return;
    }
    this.loadingService.show(this.translate.instant('assets.details.dealing.saving'));
    try {
      const res = await this.apiService.vaultSetAssetDealing(asset.address,
        'clear' in result ? { enabled: false } : { dealing: result.config });
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.getAssetDetails();
      }
    } catch (error) {
      console.error('Failed to save the dealing model', error);
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  hasContact = computed(() => {
    const c = this.parsedMetadata().contact;
    return !!(c.email || c.phone || c.website || c.address);
  });

  // All public media images (avatar + banner + gallery), for the Images section.
  mediaImages = computed<{ entry: AssetMediaEntry; role: 'avatar' | 'banner' | 'gallery' }[]>(() => {
    const media = this.parsedMetadata().media;
    if (!media) return [];
    const rows: { entry: AssetMediaEntry; role: 'avatar' | 'banner' | 'gallery' }[] = [];
    if (media.avatar) rows.push({ entry: media.avatar, role: 'avatar' });
    if (media.banner) rows.push({ entry: media.banner, role: 'banner' });
    for (const img of media.images ?? []) rows.push({ entry: img, role: 'gallery' });
    return rows;
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
    // The price chart is built from Chart.js config text (dataset labels) resolved once at
    // construction time via translate.instant — redraw it on language change since renderChart()
    // already tears down + recreates the chart on every data refresh (nearly-free hook).
    this._langSub = this.translate.onLangChange.subscribe(() => this.renderChart());
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
    this._langSub?.unsubscribe();
    this._langSub = null;
    this.revokeMediaImageUrls();
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

  setTab(tab: 'overview' | 'info' | 'registration' | 'metadata' | 'price' | 'holders' | 'trxs' | 'services' | 'docs' | 'dex' | 'distributions' | 'holdersAt') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getAssetDetails();
    // 'registration' needs no fetch here — the @if creates <app-asset-compliance-tab>, whose
    // ngOnChanges loads on the address binding, and destroys it on leave, so re-opening the
    // tab is itself the refresh.
    if (tab === 'metadata') this.loadMediaImages();
    if (tab === 'services') this.getAssetDetails();
    if (tab === 'price') this.getPriceHistory(1, 500);
    if (tab === 'holders') this.getHolders(1, 500);
    if (tab === 'trxs') this.getTransactions(1, 500);
    if (tab === 'dex') this.loadDexListing();
    if (tab === 'distributions') this.loadDistributions();
    // 'holdersAt' is user-driven (needs a block number) — no auto-load on tab open,
    // but fetch the chain head so the input can be capped and hinted.
    if (tab === 'holdersAt') this.loadChainHead();
  }

  // Latest block height, so the operator can't ask for a block that doesn't exist yet.

  // The A8 COMPLIANCE surface (declaration / composition / documents / class parties) moved
  // to <app-asset-compliance-tab> — it owns its own load, forms and writes. The tab KEY here
  // stays 'registration' because that is the chain's lifecycle noun; only the label is Compliance.

  async loadChainHead() {
    try {
      const s = await this.apiService.vaultGetSyncStatus();
      const head = Number(s?.current_block ?? 0);
      this.chainHead.set(head > 0 ? head : null);
    } catch { this.chainHead.set(null); }
  }

  async loadHoldersAt() {
    const dateMode = this.holdersAtMode() === 'date';
    let blk = 0;
    let tsSec = 0;
    if (dateMode) {
      const ds = this.holdersAtDateInput();
      if (!ds) { this.alertService.info(this.translate.instant('assets.details.holdersAt.invalidDateTitle'), this.translate.instant('assets.details.holdersAt.pickDate')); return; }
      // Interpret the picked day as END of that local day → holders "as of" that date.
      tsSec = Math.floor(new Date(ds + 'T23:59:59').getTime() / 1000);
      if (!tsSec || tsSec <= 0) { this.alertService.info(this.translate.instant('assets.details.holdersAt.invalidDateTitle'), this.translate.instant('assets.details.holdersAt.pickValidDate')); return; }
    } else {
      blk = Math.floor(Number(this.holdersAtBlockInput()));
      if (!blk || blk <= 0) { this.alertService.info(this.translate.instant('assets.details.holdersAt.invalidBlockTitle'), this.translate.instant('assets.details.holdersAt.enterPositiveBlock')); return; }
      // Refresh the head first — it advances while the tab is open, so a cached value
      // would reject a block that has since been mined.
      await this.loadChainHead();
      const head = this.chainHead();
      if (head !== null && blk > head) {
        this.alertService.info(
          this.translate.instant('assets.details.holdersAt.invalidBlockTitle'),
          this.translate.instant('assets.details.holdersAt.blockAheadOfHead', { block: blk, head }),
        );
        return;
      }
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
      case 1: return this.translate.instant('assets.details.distributions.state.declared');
      case 2: return this.translate.instant('assets.details.distributions.state.executing');
      case 3: return this.translate.instant('assets.details.distributions.state.completed');
      case 4: return this.translate.instant('assets.details.distributions.state.partiallyCompleted');
      default: return this.translate.instant('state.unknown');
    }
  }
  distTypeName(t: number): string {
    return Number(t) === 1 ? this.translate.instant('assets.details.distributions.type.creditDividend')
      : Number(t) === 2 ? this.translate.instant('assets.details.distributions.type.stockSplit')
      : this.translate.instant('state.unknown');
  }

  async openDeclareDistribution() {
    const data = await this.distributionDeclareModal.show(this.assetAddress);
    if (!data) return;
    this.loadingService.show(this.translate.instant('assets.details.distributions.declaringLoading'));
    try {
      const body = {
        distType:      data.distType,
        amount:        data.amount,
        recordBlock:   data.recordBlock,
        sweepResidual: data.sweepResidual,
      };
      let r = await this.apiService.distributionDeclare(this.assetAddress, body);
      // Phase 36 A.4 — a StockSplit at a ratio that rounds some holder's share to ZERO omits
      // them from the split entirely (`Distributions.sol` creates no leg for a zero share). The
      // API refuses with the list; the issuer sees WHO is left out and may proceed knowingly.
      if (r?.omittedHolders?.length) {
        this.loadingService.hide();
        const holders: string[] = r.omittedHolders;
        const shown = holders.slice(0, 5).join('\n') + (holders.length > 5 ? '\n…' : '');
        const ok = await this.alertService.show(
          this.translate.instant('assets.details.distributions.omittedTitle'),
          this.translate.instant('assets.details.distributions.omittedMessage', { count: holders.length, holders: shown }),
          this.translate.instant('assets.details.distributions.omittedConfirm'));
        if (!ok) return;
        this.loadingService.show(this.translate.instant('assets.details.distributions.declaringLoading'));
        r = await this.apiService.distributionDeclare(this.assetAddress, { ...body, acknowledgeOmitted: true });
      }
      if (!r || r.error) {
        this.alertService.info(this.translate.instant('assets.details.distributions.declareFailedTitle'), r?.error || this.translate.instant('assets.details.distributions.declareFailedDefault'));
      } else {
        this.alertService.info(this.translate.instant('assets.details.distributions.declaredAlertTitle'), this.translate.instant('assets.details.distributions.declaredMessage', { id: r.distribution?.distributionId }));
        await this.loadDistributions();
      }
    } catch (e: any) {
      this.alertService.info(this.translate.instant('alerts.error'), e?.message || String(e));
    } finally {
      this.loadingService.hide();
    }
  }

  async executeDistribution(distributionId: number) {
    if (!(await this.alertService.show(this.translate.instant('assets.details.distributions.executeConfirmTitle'), this.translate.instant('assets.details.distributions.executeConfirmMessage', { id: distributionId }), this.translate.instant('assets.details.distributions.execute')))) return;
    this.loadingService.show(this.translate.instant('assets.details.distributions.executingLoading', { id: distributionId }));
    try {
      const r = await this.apiService.distributionExecute(this.assetAddress, distributionId);
      if (!r || r.error) {
        this.alertService.info(this.translate.instant('assets.details.distributions.executeFailedTitle'), r?.error || this.translate.instant('assets.details.distributions.executeFailedDefault'));
      } else {
        this.alertService.info(this.translate.instant('assets.details.distributions.executedTitle'), this.translate.instant('assets.details.distributions.executedMessage', { sent: r.result?.sent ?? 0, failed: r.result?.failed ?? 0 }));
        await this.loadDistributions();
      }
    } catch (e: any) {
      this.alertService.info(this.translate.instant('alerts.error'), e?.message || String(e));
    } finally {
      this.loadingService.hide();
    }
  }

  async finalizeDistribution(distributionId: number) {
    if (!(await this.alertService.show(this.translate.instant('assets.details.distributions.finalizeConfirmTitle'), this.translate.instant('assets.details.distributions.finalizeConfirmMessage', { id: distributionId }), this.translate.instant('assets.details.distributions.finalize')))) return;
    this.loadingService.show(this.translate.instant('assets.details.distributions.finalizingLoading', { id: distributionId }));
    try {
      const r = await this.apiService.distributionFinalize(this.assetAddress, distributionId);
      if (!r || r.error) {
        this.alertService.info(this.translate.instant('assets.details.distributions.finalizeFailedTitle'), r?.error || this.translate.instant('assets.details.distributions.finalizeFailedDefault'));
      } else {
        this.alertService.info(this.translate.instant('assets.details.distributions.finalizedTitle'), this.translate.instant('assets.details.distributions.finalizedMessage', { state: this.distStateName(r.result?.state) }));
        await this.loadDistributions();
      }
    } catch (e: any) {
      this.alertService.info(this.translate.instant('alerts.error'), e?.message || String(e));
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
    this.loadingService.show(this.translate.instant('assets.details.dex.listingOnDex'));
    try {
      const r = await this.apiService.vaultDexAssetListingCreate(result.baseAsset, result.venue, result.country, result.global);
      if ((r as any)?.error) { this.alertService.info(this.translate.instant('alerts.error'), (r as any).error); return; }
      await this.loadDexListing();
    } finally { this.loadingService.hide(); }
  }

  goDexListing() { this.router.navigate(['/authorized/dex/asset-listings/details/' + this.assetAddress]); }

  dexTierLabel(t: number): string {
    return t === 1 ? this.translate.instant('assets.details.dex.tier1')
      : t === 2 ? this.translate.instant('assets.details.dex.tier2')
      : t === 3 ? this.translate.instant('assets.details.dex.tier3')
      : this.translate.instant('common.notSet');
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
    if (u && u.issuerEntityState && u.issuerEntityState !== 2) return this.translate.instant('assets.details.dex.blockedIssuerInactive');
    if (u && !u.assetTradable && u.syncedAt) return this.translate.instant('assets.details.dex.blockedAssetInactive');
    return '';
  }

  private getAssetStateName(state: number): string | undefined {
    const map: Record<number, string> = {
      0: this.translate.instant('assets.details.stateInactive'),
      1: this.translate.instant('state.initiated'),
      2: this.translate.instant('state.active'),
      3: this.translate.instant('state.suspended'),
      4: this.translate.instant('state.deactivated'),
    };
    return map[state];
  }

  getServiceStateName(state: number): string {
    const map: Record<number, string> = {
      0: this.translate.instant('state.unknown'),
      1: this.translate.instant('state.pending'),
      2: this.translate.instant('state.active'),
      3: this.translate.instant('state.suspended'),
      4: this.translate.instant('assets.details.serviceStateExitOnly'),
      5: this.translate.instant('state.deactivated'),
    };
    return map[state] ?? this.translate.instant('state.unknown');
  }

  private mapVaultAsset(raw: any): Asset {
    return {
      address: raw.address,
      name: raw.name,
      symbol: raw.symbol,
      assetClass: raw.asset_class ?? 0,
      assetClassName: raw.asset_class_name ?? String(raw.asset_class ?? ''),
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
      canManage: raw.canManage === true || raw.can_manage === true || raw.can_manage === 1,
      creditSettlement: raw.credit_settlement === true || raw.credit_settlement === 1,
      state: raw.state ?? 0,
      stateName: raw.asset_state_name ?? this.getAssetStateName(raw.state) ?? String(raw.state ?? ''),
      priceMode: raw.priceMode ?? raw.price_mode ?? 2,
      priceModeName: raw.priceModeName ?? raw.price_mode_name ?? (Number(raw.priceMode ?? raw.price_mode ?? 2) === 1 ? this.translate.instant('assets.details.info.priceModeSingle') : this.translate.instant('assets.details.info.priceModeBidAsk')),
      supplyMode: raw.supplyMode ?? raw.supply_mode ?? 1,
      supplyModeName: raw.supplyModeName ?? raw.supply_mode_name ?? (Number(raw.supplyMode ?? raw.supply_mode ?? 1) === 2 ? this.translate.instant('assets.details.info.supplyModeDynamic') : this.translate.instant('assets.details.info.supplyModeFixed')),
      // 33.G G.4 — served on class-1 assets only; absent = not a fund unit, never "current".
      navStatus: raw.nav_status && typeof raw.nav_status === 'object' ? {
        row:         Number(raw.nav_status.row) || 0,
        documentId:  Number(raw.nav_status.documentId) || 0,
        signedAt:    raw.nav_status.signedAt != null ? Number(raw.nav_status.signedAt) : null,
        cadenceDays: raw.nav_status.cadenceDays != null ? Number(raw.nav_status.cadenceDays) : null,
        status:      raw.nav_status.status,
        refuse:      raw.nav_status.refuse === true,
      } : null,
      issuerService: raw.issuer_service || null,
    };
  }

  // ─── Issuing service (AS.1, 33.A) ─────────────────────────────────────────────────────────
  // An asset is created WITHOUT its issuing service; this card sets it (and changes it later).
  // Offered: this tenant's services holding an ACTIVE Token Issuer licence (27) — the on-chain
  // re-validation (`requireIssuerService`) refuses anything else. The payment-processor WARNING
  // moved here from the creation wizard (ruling (a)): credit settlement is not conditioned on a
  // PP by the contract, but primary money needs a rail for the asset's currency.
  issuerCandidates = signal<{ address: string; name: string; paymentProcessor: string | null }[]>([]);
  issuerPick = signal<string>('');

  canSetIssuerService(): boolean {
    return this.canManage() && this.userInfo?.role !== 3 && this.features.systemFunctionEnabled('asset-issuer-service');
  }

  issuerServiceName(): string {
    const a = this.asset();
    if (!a?.issuerService) return '';
    const hit = this.issuerCandidates().find(c => c.address.toLowerCase() === a.issuerService!.toLowerCase())
      ?? a.services.find(s => s.service.toLowerCase() === a.issuerService!.toLowerCase());
    return (hit as any)?.name ?? (hit as any)?.serviceName ?? '';
  }

  issuerPickHasNoPP(): boolean {
    const c = this.issuerCandidates().find(x => x.address === this.issuerPick());
    return !!c && !c.paymentProcessor;
  }

  async loadIssuerCandidates() {
    const data = await this.apiService.vaultGetServicesOwn(0, 50);
    this.issuerCandidates.set((data?.services ?? [])
      .filter((s: any) => (s.license_class_ids ?? []).includes(27))   // 27 = Token Issuer licence
      .map((s: any) => ({ address: s.address, name: s.name, paymentProcessor: s.payment_processor ?? null })));
  }

  async saveIssuerService() {
    const a = this.asset();
    const pick = this.issuerPick();
    if (!a || !pick) return;
    const name = this.issuerCandidates().find(c => c.address === pick)?.name ?? pick;
    const confirmed = await this.alertService.show(
      this.translate.instant('assets.details.issuerService.confirmTitle'),
      this.translate.instant(a.issuerService ? 'assets.details.issuerService.confirmChange' : 'assets.details.issuerService.confirmSet', { name }),
      this.translate.instant('assets.details.issuerService.confirmButton'),
    );
    if (!confirmed) return;
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      const r: any = await this.apiService.vaultSetAssetIssuerService(a.address, pick);
      if (!r || r.error || r.type === 'error') {
        this.alertService.info(this.translate.instant('alerts.error'), r?.error || this.translate.instant('alerts.unexpected'));
        return;
      }
      this.issuerPick.set('');
      await this.getAssetDetails(true);
    } catch {
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  // ─── Attestations (33.G G.4) ─────────────────────────────────────────────────
  // The issuer records; the party signs. Fund units only. Two keys because it is two acts on
  // the API (a document write + a requirement declaration) and both are gated there.
  canRecordAttestation(): boolean {
    const a = this.asset();
    return !!a && Number(a.assetClass) === 1 && this.canManage()
      && this.userInfo?.role !== 3
      && this.features.systemFunctionEnabled('asset-compose')
      && this.features.systemFunctionEnabled('manage-documents');
  }

  async openAttestationModal(row: 37 | 38 = 38) {
    const asset = this.asset();
    if (!asset) return;
    const result = await this.attestationModal.show({ symbol: asset.symbol, currencyCode: asset.currencyCode, row });
    if (!result) return;
    this.loadingService.show(this.translate.instant('assets.attestationModal.saving'));
    try {
      const r: any = await this.apiService.assetAttestationAdd(asset.address, result);
      if (!r || r.error) {
        this.alertService.info(this.translate.instant('alerts.error'), r?.error || this.translate.instant('alerts.unexpected'));
        return;
      }
      this.alertService.info(
        this.translate.instant('assets.attestationModal.doneTitle'),
        this.translate.instant('assets.attestationModal.doneMessage', {
          documentId: r.documentId, row: result.row,
          shared: (r.sharedWith || []).map((s: string) => this.utils.shortAddr(s)).join(', '),
        }));
      await this.getAssetDetails();
    } catch (error) {
      console.error('Failed to record the attestation', error);
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  /** The NAV badge's colour follows the GATE, not the label: refused is red, unsigned amber. */
  navBadgeClass(): string {
    const n = this.asset()?.navStatus;
    if (!n) return '';
    if (n.refuse) return 'bg-red-100 text-red-800';
    if (n.status === 'current') return 'bg-green-100 text-green-800';
    return 'bg-amber-100 text-amber-800';
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
    if (!silent) this.loadingService.show(this.translate.instant('common.loadingData'));
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
          stateName: s.state_name ?? this.getServiceStateName(s.state),
          canQuote: !!(s.can_quote ?? s.canQuote ?? 0),
          distributionAccepted: !!(s.distribution_accepted ?? s.distributionAccepted ?? 0),
          // Own-entity services need no consent; default true so an older API keeps today's rendering.
          consentRequired: (s.consent_required ?? s.consentRequired) !== false,
        }));
      }
      this.asset.set(asset);
      if (this.canSetIssuerService() && this.issuerCandidates().length === 0) void this.loadIssuerCandidates();
      if (asset.suspended) {
        const logs = await this.apiService.vaultGetStateChangeLogs(asset.address, 1, 1);
        if (logs?.logs?.length > 0) {
          this.suspensionReason.set(logs.logs[0].reason || '');
        }
      } else {
        this.suspensionReason.set('');
      }
    } else {
      // The asset is not in this vault's inventory. The API 404s any asset the
      // tenant does not own (requireOwnAsset), so this is the direct-URL case:
      // the mirror is chain-wide, and before the guard a pasted address opened
      // a foreign asset here complete with Mint / Burn / Change State. Bounce
      // out rather than rendering an empty shell with live action buttons.
      if (!silent) {
        this.loadingService.hide();
        await this.alertService.info(
          this.translate.instant('assets.details.notFoundTitle'),
          this.translate.instant('assets.details.notFoundMessage'),
        );
      }
      this.router.navigate(['/authorized/assets/list']);
      return;
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
    this.loadingService.show(this.translate.instant('assets.details.services.updatingServiceState'));
    try {
      const res = await this.apiService.vaultSetAssetServiceState(this.assetAddress, serviceAddress, result.state, result.reason);
      await this.getAssetDetails();
      if (res?.requestId) {
        this.alertService.info(this.translate.instant('assets.details.submittedForApprovalTitle'), this.translate.instant('assets.details.submittedForApprovalMessage'), this.translate.instant('alerts.ok'));
      }
    } catch (error) {
      console.error('Failed to change service state', error);
    } finally {
      this.loadingService.hide();
    }
  }

  async toggleServiceCanQuote(serviceAddress: string, serviceName: string, currentlyAllowed: boolean) {
    const next = !currentlyAllowed;
    const title = next ? this.translate.instant('assets.details.services.allowQuotingTitle') : this.translate.instant('assets.details.services.revokeQuotingTitle');
    const message = next
      ? this.translate.instant('assets.details.services.allowQuotingMessage', { name: serviceName })
      : this.translate.instant('assets.details.services.revokeQuotingMessage', { name: serviceName });
    const confirmed = await this.alertService.show(title, message, next ? this.translate.instant('assets.details.services.allowBtn') : this.translate.instant('assets.details.services.pinBtn'));
    if (!confirmed) return;
    this.loadingService.show(this.translate.instant('assets.details.services.updatingCanQuote'));
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
      this.loadingService.show(this.translate.instant('assets.details.info.changingState'));
      try {
        const res = await this.apiService.vaultUpdateAssetState(currentAsset.address, result.state, result.reason);
        await this.getAssetDetails();
        if (res?.requestId) {
          this.alertService.info(this.translate.instant('assets.details.submittedForApprovalTitle'), this.translate.instant('assets.details.submittedForApprovalMessage'), this.translate.instant('alerts.ok'));
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
      title: this.translate.instant('assets.details.metadata.editModalTitle'),
      description: pm.description,
      contact: pm.contact,
      entries: pm.entries,
    });
    if (!result) return;
    this.loadingService.show(this.translate.instant('assets.details.metadata.updatingMetadata'));
    try {
      const res = await this.apiService.vaultUpdateAssetMetadata(asset.address, result);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error || this.translate.instant('assets.details.metadata.updateFailedDefault'));
      } else {
        await this.getAssetDetails();
      }
    } catch (error) {
      console.error('Failed to update metadata', error);
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  // ─── Identifiers section (metadata tab) ──────────────────────────────────────
  // Security identifiers (ISIN, …) recorded in the asset's public metadata. Unlike the
  // entity's, these are NOT bound on-chain: the metadata is the whole record, so there is
  // no hash to reconcile and no "out of sync" state — but also nothing to catch a typo,
  // which is why the format check runs both here and in the API.

  assetIdTypes = signal<GlobalVariable[]>([]);

  canEditIdentifiers(): boolean {
    return this.canManage()
      && this.userInfo?.role !== 3
      && this.features.systemFunctionEnabled('asset-edit-identifiers');
  }

  // The vocabulary comes from Global Variables, never a hardcoded list — a chain seeded with
  // extra types (CUSIP, SEDOL, …) has to offer them without a Vault rebuild. Fetched once.
  private async ensureAssetIdTypes(): Promise<GlobalVariable[]> {
    if (this.assetIdTypes().length) return this.assetIdTypes();
    try {
      // toGlobalVariables, not a raw assign: the API serves `variable_id` and the modal reads
      // `variableId`, so passing the rows through left every id undefined and disabled Save.
      const types = await this.apiService.vaultGetGlobalVariablesByCategory('ID Type - Asset');
      this.assetIdTypes.set(toGlobalVariables(types));
    } catch {
      this.assetIdTypes.set([]);
    }
    return this.assetIdTypes();
  }

  async openIdentifierModal(existing?: AssetIdentifier) {
    const asset = this.asset();
    if (!asset) return;

    const all = await this.ensureAssetIdTypes();
    if (!all.length) {
      this.alertService.info(
        this.translate.instant('alerts.error'),
        this.translate.instant('assets.details.identifiers.noTypes'),
      );
      return;
    }

    // Editing locks the type to the row being edited. Adding offers only UNHELD types:
    // one entry per type, so offering a held one looks like a second slot while silently
    // replacing the existing value.
    const held = new Set(this.parsedMetadata().identifiers.map(i => i.idType));
    const idTypes = existing
      ? all.filter(t => t.variableId === existing.idType)
      : all.filter(t => !held.has(t.variableId));
    if (!idTypes.length) {
      this.alertService.info(
        this.translate.instant('alerts.error'),
        this.translate.instant('assets.details.identifiers.allHeld'),
      );
      return;
    }

    const result = await this.identifierModal.show({
      idTypes,
      // No reason field: this is a plain metadata edit with nowhere to record one, unlike
      // the entity write which carries a reason into the on-chain audit row.
      showReason: false,
      ...(existing ? { idType: existing.idType, value: existing.value } : {}),
    });
    if (!result) return;

    this.loadingService.show(this.translate.instant('assets.details.identifiers.saving'));
    try {
      const res: any = await this.apiService.vaultSetAssetIdentifier(asset.address, {
        idType: result.idType,
        value:  result.value,
      });
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.getAssetDetails();
      }
    } catch (error) {
      console.error('Failed to save asset identifier', error);
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  async removeIdentifier(row: AssetIdentifier) {
    const asset = this.asset();
    if (!asset) return;

    const confirmed = await this.alertService.show(
      this.translate.instant('assets.details.identifiers.removeTitle'),
      this.translate.instant('assets.details.identifiers.removeMessage', { name: row.name || String(row.idType), value: row.value }),
      this.translate.instant('common.remove'),
    );
    if (!confirmed) return;

    this.loadingService.show(this.translate.instant('assets.details.identifiers.removing'));
    try {
      const res: any = await this.apiService.vaultRemoveAssetIdentifier(asset.address, row.idType);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.getAssetDetails();
      }
    } catch (error) {
      console.error('Failed to remove asset identifier', error);
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  // ─── Images section (metadata tab) ────────────────────────────────────────────
  // Public media images render through the ACL-checked document file stream (correct
  // Content-Type, works for the entity regardless of pin form) → blob URLs cached per
  // documentId and revoked on leave.

  mediaImageUrls = signal<Record<number, string>>({});
  mediaImagesLoading = signal(false);

  async loadMediaImages() {
    const rows = this.mediaImages();
    if (!rows.length) return;
    const current = this.mediaImageUrls();
    const missing = rows.filter(r => !current[r.entry.documentId]);
    if (!missing.length) return;
    this.mediaImagesLoading.set(true);
    try {
      for (const r of missing) {
        const res = await this.apiService.assetDocumentFetchFile(this.assetAddress, r.entry.documentId);
        if (res?.blobUrl) {
          this.mediaImageUrls.update(m => ({ ...m, [r.entry.documentId]: res.blobUrl }));
        }
      }
    } finally {
      this.mediaImagesLoading.set(false);
    }
  }

  private revokeMediaImageUrls() {
    for (const url of Object.values(this.mediaImageUrls())) URL.revokeObjectURL(url);
    this.mediaImageUrls.set({});
  }

  private async refreshMediaImages() {
    this.revokeMediaImageUrls();
    await this.getAssetDetails();
    await this.loadMediaImages();
  }

  // Public asset profile preview — banner/avatar hero + description + metadata KV +
  // gallery + public documents, all sourced from the asset row and its media index.
  async openViewAssetModal() {
    const asset = this.asset();
    if (!asset) return;
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      await this.loadMediaImages();
      const entity = await this.apiService.vaultGetEntityInfo().catch(() => null);
      const pm = this.parsedMetadata();
      this.publicViewModal.show({
        address:       asset.address,
        name:          asset.name,
        symbol:        asset.symbol,
        entityName:    entity?.name || '',
        assetClassName: asset.assetClassName || '',
        currencyCode:  asset.currencyCode || '',
        description:   pm.description,
        contact:       pm.contact,
        entries:       pm.entries,
        media:         pm.media,
        imageUrls:     this.mediaImageUrls(),
      });
    } finally {
      this.loadingService.hide();
    }
  }

  async openAddImageModal() {
    const data = await this.imageAddModal.show();
    if (!data) return;
    this.loadingService.show(this.translate.instant('assets.details.media.uploading'));
    try {
      const res = await this.apiService.assetDocumentAddMultipart(this.assetAddress, data.file, {
        title: data.title,
        description: '',
        fileType: data.file.type,
        documentType: data.documentType,
        documentState: 1,
        ...(data.role !== 'gallery' ? { imageRole: data.role } : {}),
      });
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.refreshMediaImages();
      }
    } catch (error) {
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  async changeMediaRole(documentId: number, role: 'avatar' | 'banner' | 'gallery') {
    this.loadingService.show(this.translate.instant('assets.details.media.updatingRole'));
    try {
      const res = await this.apiService.vaultSetAssetMediaRole(this.assetAddress, documentId, role);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.refreshMediaImages();
      }
    } catch (error) {
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  async removeMediaImage(row: { entry: AssetMediaEntry; role: string }) {
    const confirmed = await this.alertService.show(
      this.translate.instant('assets.details.media.removeConfirmTitle'),
      this.translate.instant('assets.details.media.removeConfirmMessage', { title: row.entry.title }),
      this.translate.instant('common.remove'),
    );
    if (!confirmed) return;
    this.loadingService.show(this.translate.instant('assets.details.media.removing'));
    try {
      const res = await this.apiService.assetDocumentRemove(this.assetAddress, row.entry.documentId);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.refreshMediaImages();
      }
    } catch (error) {
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  async openAddPriceModal() {
    const asset = this.asset();
    if (!asset) return;
    const lp = this.latestPrice();
    const dealing = this.parsedMetadata().dealing;
    const result = await this.priceModal.show({
      priceMode: asset.priceMode,
      supplyMode: asset.supplyMode,
      symbol: asset.symbol,
      currentBid: lp?.bid,
      currentAsk: lp?.ask,
      // On a forward-priced asset the price's effective time releases the day's queue (A.7).
      forward: dealing ? { tz: dealing.tz, valuationTime: dealing.valuationTime } : null,
    });
    if (!result) return;
    this.loadingService.show(this.translate.instant('assets.details.price.savingPrice'));
    try {
      const r = await this.apiService.vaultSetAssetPrice({
        asset: this.assetAddress,
        bid: result.bid,
        ask: result.ask,
        timestamp: result.timestamp,
      });
      if ((r as any)?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), (r as any).error);
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
    this.loadingService.show(this.translate.instant('assets.details.info.mintingSupply'));
    try {
      const r = await this.apiService.vaultMintAsset(this.assetAddress, result.tokens);
      if ((r as any)?.error) { this.alertService.info(this.translate.instant('assets.details.info.mintFailedTitle'), (r as any).error); return; }
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
    this.loadingService.show(this.translate.instant('assets.details.info.burningSupply'));
    try {
      const r = await this.apiService.vaultBurnAsset(this.assetAddress, result.tokens);
      if ((r as any)?.error) { this.alertService.info(this.translate.instant('assets.details.info.burnFailedTitle'), (r as any).error); return; }
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
      this.loadingService.show(this.translate.instant('assets.details.services.addingService'));
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
      this.translate.instant('assets.details.services.removeServiceTitle'),
      this.translate.instant('assets.details.services.removeServiceMessage', { name: label }),
      this.translate.instant('common.remove')
    );
    if (!confirmed) return;
    this.loadingService.show(this.translate.instant('assets.details.services.removingService'));
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
    if (!silent) this.loadingService.show(this.translate.instant('common.loadingData'));
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
    this.pricePage.set(1);

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

    // The chart follows the asset's PRICE MODE (V30), as the table below it already does:
    // 1 = fixed-priced, ONE series and it is the price (NAV) — bid == ask by contract invariant,
    // so a second line sat exactly on the first and "Bid" named a quote side the asset does
    // not have; 2 = market-priced, Bid and Ask.
    const isSingleMode = this.asset()?.priceMode === 1;
    const datasets: any[] = [
      {
        label: this.translate.instant(isSingleMode ? 'assets.details.price.priceColumn' : 'assets.details.price.bid'),
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
    ];
    if (!isSingleMode) {
      datasets.push({
        label: this.translate.instant('assets.details.price.ask'),
        data: askData,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#10b981',
        fill: true,
        tension: 0.4,
      });
    }

    this.chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets,
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
    if (!silent) this.loadingService.show(this.translate.instant('common.loadingData'));
    const [holdersData, priceData] = await Promise.all([
      this.apiService.vaultGetAssetHolders(this.assetAddress, start - 1, offset),
      this.apiService.vaultGetAssetPrice(this.assetAddress),
    ]);
    if (holdersData?.holders) this.holders.set(holdersData.holders);
    if (priceData?.bid) this.currentBid.set(priceData.bid);
    this.holderPage.set(1);
    if (!silent) this.loadingService.hide();
  }

  async getTransactions(start: number, offset: number, silent = false) {
    if (!silent) this.loadingService.show(this.translate.instant('common.loadingData'));
    const data = await this.apiService.vaultGetTransactions({ asset: this.assetAddress }, start - 1, offset);
    if (data?.transactions) this.transactions.set(data.transactions.map((t: any) => this.mapVaultTransaction(t)));
    this.trxPage.set(1);
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
    this.trxPage.set(1);
  }

  clearHolderFilter() {
    this.filterHolder.set('');
    this.filterBalanceOp.set('');
    this.filterBalanceAmt.set(null);
    this.holderPage.set(1);
  }

  exportHoldersExcel() {
    const bid = this.currentBid();
    const rows = this.filteredHolders().map(h => {
      const value = this.utils.round6(h.balance * bid);
      const pl = this.utils.round6(value - h.cost);
      return {
        'Holder': h.holder,
        'Balance': h.balance,
        'Cost': this.utils.roundMoney(h.cost),
        'Value': this.utils.roundMoney(value),
        'P/L': this.utils.roundMoney(pl),
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
        const value = this.utils.round6(h.balance * bid);
        const pl = this.utils.round6(value - h.cost);
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

  // Historical snapshot exports. The block (and its on-chain time) is the whole
  // point of the artefact — an evidence pack that doesn't say WHICH block it
  // reconstructs is worthless — so both carry it in the filename and the sheet.
  exportHoldersAtExcel() {
    const blk = this.holdersAtQueried();
    const t   = this.holdersAtTime();
    const rows: Record<string, string | number>[] = this.holdersAtRows().map((h, i) => ({
      '#': i + 1,
      'Account': h.account,
      'Balance': h.balance ?? '',
      'Block': blk ?? '',
      'Block Time': t !== null ? new Date(t * 1000).toISOString() : '',
    }));
    // Trailing total row — the sheet is the artefact, so it has to carry the same
    // bottom line the screen shows rather than making the reader re-add the column.
    rows.push({ '#': '', 'Account': 'TOTAL', 'Balance': this.holdersAtTotal(), 'Block': '', 'Block Time': '' });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Holders at Block');
    XLSX.writeFile(wb, `asset_holders_at_block_${blk ?? 'unknown'}.xlsx`);
    this.auditService.logExport('excel', 'asset_holders_at_block');
  }

  exportHoldersAtPdf() {
    const blk = this.holdersAtQueried();
    const t   = this.holdersAtTime();
    const asset = this.asset();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Holders at Block ${blk ?? ''} — ${asset?.name ?? ''}`, pad, 15);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(
      `Block: ${blk ?? '—'}${t !== null ? `  |  Block time: ${new Date(t * 1000).toISOString()}` : ''}  |  Holders: ${this.holdersAtCount()}`,
      pad, 24,
    );
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 31,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      footStyles: { fillColor: [237, 242, 247], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'right' } },
      head: [[
        { content: '#' },
        { content: 'Account' },
        { content: 'Balance', styles: { halign: 'right' } },
      ]],
      body: this.holdersAtRows().map((h, i) => [
        i + 1,
        h.account,
        h.balance === null ? '—' : this.utils.formatTokens(h.balance),
      ]),
      foot: [[
        { content: '' },
        { content: 'Total' },
        { content: this.utils.formatTokens(this.holdersAtTotal()), styles: { halign: 'right' } },
      ]],
    });

    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`asset_holders_at_block_${blk ?? 'unknown'}.pdf`);
    this.auditService.logExport('pdf', 'asset_holders_at_block');
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
      'Price': this.utils.roundMoney(t.price),
      'Total': this.utils.roundMoney(t.totalPrice),
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