import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { HeaderComponent } from '../../../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../../../shared/components/live-indicator/live-indicator.component';
import { RefreshButtonComponent } from '../../../../../shared/components/refresh-button/refresh-button.component';
import { ApiService } from '../../../../../shared/services/api.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { SocketService } from '../../../../../shared/services/socket.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { DexRfqRequest, DexDealCounterparty } from '../../../../../shared/models/data.model';
import { PaginatorComponent, pageSlice } from '../../../../../shared/components/paginator/paginator.component';
import { ModalRfqCreateComponent } from '../modals/modal-rfq-create/modal-rfq-create.component';
import { ModalRfqCreateService } from '../modals/modal-rfq-create/modal-rfq-create.service';
import { RFQ_STATUS_LABEL, RFQ_STATUS_CLASS, rfqSideLabel, rfqFundingLabel } from '../rfq-labels';

/**
 * Requests for quote — the competitive surface, where the deals page is bilateral.
 *
 * Three tabs, because a request reaches this tenant in three different roles and one
 * merged table hides the only one that is work:
 *   • Invitations — open requests awaiting OUR quote.
 *   • My requests — the ones we broadcast, where we award.
 *   • All         — everything visible, for history and search.
 *
 * ⚠️ No socket refresh. `emitVaultUpdate` drops plugin-owned scopes and `dex_rfq_*` is
 * plugin-written, so nothing pushes here — hence the explicit Refresh control
 * (Standard 3.6). Without it a live auction reads as dead.
 */
@Component({
  selector: 'app-vault-dex-rfqs-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    FormsModule, HeaderComponent, LiveIndicatorComponent, RefreshButtonComponent,
    TranslatePipe, PaginatorComponent, ModalRfqCreateComponent,
  ],
})
export class ListPage implements OnInit, OnDestroy {
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private translate = inject(TranslateService);
  private router = inject(Router);
  private socket = inject(SocketService);
  private alertService = inject(AlertService);
  private authService = inject(AuthService);
  private createModal = inject(ModalRfqCreateService);
  utils = inject(UtilsService);
  features = inject(FeaturesService);

  tab = signal<'inbox' | 'mine' | 'all'>('inbox');
  inbox = signal<DexRfqRequest[]>([]);
  mine = signal<DexRfqRequest[]>([]);
  all = signal<DexRfqRequest[]>([]);
  refreshing = signal(false);

  search = signal('');
  filterStatus = signal<string>('');
  filterFunding = signal<string>('');
  filterAsset = signal<string>('');

  private sub?: Subscription;

  ngOnInit() {}

  async ionViewDidEnter() {
    await this.refresh();
    this.sub = this.socket.vaultUpdated$.subscribe(p => {
      if (p.type === 'dex' || p.type === 'dex-rfq' || p.type === 'dex-deal') this.refresh(true);
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async refresh(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show(this.translate.instant('dex.rfqs.loadingList'));
    try {
      const [inbox, mine, all] = await Promise.all([
        this.apiService.vaultDexRfqsInbox(0, 200),
        this.apiService.vaultDexRfqsList({ mine: true, start: 0, offset: 200 }),
        this.apiService.vaultDexRfqsList({ start: 0, offset: 200 }),
      ]);
      this.inbox.set(inbox?.requests ?? []);
      this.mine.set(mine?.requests ?? []);
      this.all.set(all?.requests ?? []);
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  setTab(t: 'inbox' | 'mine' | 'all') {
    this.tab.set(t);
    this.page.set(1);
  }

  source = computed<DexRfqRequest[]>(() => {
    switch (this.tab()) {
      case 'inbox': return this.inbox();
      case 'mine':  return this.mine();
      default:      return this.all();
    }
  });

  /** 1-based, per frontend Standard 1.5. */
  page = signal(1);
  pageSize = signal(25);
  paged = computed(() => pageSlice(this.filtered(), this.page(), this.pageSize()));

  filtered = computed(() => {
    const term = this.search().toLowerCase();
    const status = this.filterStatus();
    const funding = this.filterFunding();
    const asset = this.filterAsset().toLowerCase();
    return this.source().filter(q =>
      (!status || String(q.status) === status) &&
      (!funding || String(q.funding) === funding) &&
      (!asset || (q.assetSymbol || '').toLowerCase().includes(asset) ||
                 (q.assetName || '').toLowerCase().includes(asset) ||
                 q.baseAsset.toLowerCase().includes(asset)) &&
      (!term ||
        q.requestKey.toLowerCase().includes(term) ||
        (q.assetName || '').toLowerCase().includes(term) ||
        (q.assetSymbol || '').toLowerCase().includes(term) ||
        (q.dexServiceName || '').toLowerCase().includes(term) ||
        (q.requesterEntityName || '').toLowerCase().includes(term) ||
        q.requester.toLowerCase().includes(term))
    );
  });

  clearFilters() {
    this.search.set('');
    this.filterStatus.set('');
    this.filterFunding.set('');
    this.filterAsset.set('');
    this.page.set(1);
  }

  statusLabel(q: DexRfqRequest)  { return this.translate.instant(RFQ_STATUS_LABEL[q.status] ?? 'common.unknown'); }
  statusClass(q: DexRfqRequest)  { return RFQ_STATUS_CLASS[q.status] ?? 'bg-gray-100 text-gray-700'; }
  sideLabel(q: DexRfqRequest)    { return this.translate.instant(rfqSideLabel(q.side)); }
  fundingLabel(q: DexRfqRequest) { return this.translate.instant(rfqFundingLabel(q.funding)); }

  requesterName(q: DexRfqRequest): string {
    return q.requesterEntityName || (q.requester.slice(0, 10) + '…');
  }

  fmtAmount(n: number) { return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }

  /** Time left on the ONE clock every child quote inherits. */
  expiresIn(q: DexRfqRequest): string {
    if (!q.isOpen || !q.expiresAt) return '—';
    const ms = q.expiresAt - Date.now();
    if (ms <= 0) return this.translate.instant('dex.deals.expired');
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m`;
    return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
  }

  view(q: DexRfqRequest) { this.router.navigate(['/authorized/dex/rfqs/details/' + q.requestKey]); }

  // ─── Create ─────────────────────────────────────────────────────────────────
  // The only write that starts here. Quoting, awarding and cancelling all need a
  // request to act on and live on that request's page.

  canCreate(): boolean {
    return this.authService.userInfo?.role !== 3
      && this.features.systemFunctionEnabled('dex-rfq-create');
  }

  async createRequest() {
    if (!this.canCreate()) return;

    // Pull the pickers only on demand — four list calls on every page load, for a form
    // most visits never open, is not worth it.
    this.loadingService.show(this.translate.instant('common.loading'));
    let subs: any[] = [], venues: any[] = [], assets: any[] = [], counterparties: DexDealCounterparty[] = [];
    try {
      const [s, v, a, c] = await Promise.all([
        this.apiService.vaultGetSubscriptions(undefined, 0, 1000),
        this.apiService.vaultDexVenuesList(1, 200),
        this.apiService.vaultGetAssets(0, 200),
        this.apiService.vaultDexDealCounterparties(50),
      ]);
      subs = s?.subscriptions ?? [];
      venues = v?.venues ?? [];
      assets = a?.assets ?? [];
      counterparties = c ?? [];
    } finally { this.loadingService.hide(); }

    if (!subs.length) {
      await this.alertService.show(
        this.translate.instant('alerts.error'),
        this.translate.instant('dex.deals.actions.noSubscriptions'),
        this.translate.instant('alerts.ok'), 'max-w-md', true);
      return;
    }

    const result = await this.createModal.show({
      subscriptions: subs.map((s: any) => ({
        address: s.subscription ?? s.address,
        label: [s.serviceName, s.subscription ?? s.address].filter(Boolean).join(' · '),
      })),
      venues: venues.map((v: any) => ({ address: v.serviceAddress, label: v.serviceName || v.serviceAddress })),
      assets: assets.map((a: any) => ({ address: a.address, label: [a.symbol, a.name].filter(Boolean).join(' — ') || a.address })),
      counterparties,
    });
    if (!result) return;

    this.loadingService.show(this.translate.instant('dex.rfqs.actions.creating'));
    try {
      const res = await this.apiService.vaultDexRfqCreate(result);
      if (res?.error) {
        await this.alertService.show(
          this.translate.instant('alerts.error'), res.error,
          this.translate.instant('alerts.ok'), 'max-w-md', true);
        return;
      }
      await this.refresh(true);
      // Straight to the request: broadcasting is the start of an auction, and the next
      // thing the user wants is to watch the quotes arrive.
      if (res?.requestKey) this.router.navigate(['/authorized/dex/rfqs/details/' + res.requestKey]);
    } finally { this.loadingService.hide(); }
  }

  exportExcel() {
    const rows = this.filtered().map(q => ({
      'Request': q.requestKey,
      'Venue': q.dexServiceName || q.dexService,
      'Asset': q.assetSymbol || q.baseAsset,
      'Requester': q.requesterEntityName || q.requester,
      'Requester Side': this.sideLabel(q),
      'Funding': this.fundingLabel(q),
      'Status': this.statusLabel(q),
      'Amount': this.fmtAmount(q.amount),
      'Currency': q.currencyName || q.currencyCode,
      'Invited': q.invitedCount,
      'Quotes': q.quoteCount,
      'Open To All': q.openToAll ? 'Yes' : 'No',
      'Suspended': q.suspended ? 'Yes' : 'No',
      'Expires': q.expiresAt ? this.utils.formatTime(q.expiresAt) : '—',
      'Updated': q.updatedAt ? this.utils.formatTime(q.updatedAt) : '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DEX RFQs');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `dex_rfqs_${stamp}.xlsx`);
  }

  exportPdf() {
    const requests = this.filtered();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('DEX Requests for Quote', pad, 15);
    autoTable(doc, {
      startY: 28,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [['#', 'Venue', 'Asset', 'Requester', 'Side', 'Funding', 'Status', 'Amount', 'Invited', 'Quotes', 'Expires']],
      body: requests.map((q, i) => [
        String(i + 1),
        q.dexServiceName || q.dexService.slice(0, 10),
        q.assetSymbol || q.baseAsset.slice(0, 10),
        q.requesterEntityName || q.requester.slice(0, 10),
        this.sideLabel(q),
        this.fundingLabel(q),
        this.statusLabel(q),
        this.fmtAmount(q.amount),
        String(q.invitedCount),
        String(q.quoteCount),
        q.expiresAt ? this.utils.formatTime(q.expiresAt) : '—',
      ]),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`dex_rfqs_${stamp}.pdf`);
  }
}
