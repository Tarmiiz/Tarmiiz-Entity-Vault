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
import { MoneyPipe } from '../../../../../shared/pipes/money.pipe';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { DexDeal, DexDealCounterparty } from '../../../../../shared/models/data.model';
import { PaginatorComponent, pageSlice } from '../../../../../shared/components/paginator/paginator.component';
import { ModalDealTermsComponent } from '../modals/modal-deal-terms/modal-deal-terms.component';
import { ModalDealTermsService } from '../modals/modal-deal-terms/modal-deal-terms.service';
import { DEAL_STATUS_LABEL, DEAL_STATUS_CLASS, dealSideLabel, dealFundingLabel } from '../deal-labels';

/**
 * Negotiated OTC deals — the bilateral surface, in contrast to the anonymous order book.
 *
 * Three tabs, because a deal reaches this tenant in three different roles and mixing
 * them into one table hides the only two that are actionable:
 *   • Inbox           — waiting on US to counter / accept / decline.
 *   • Venue approvals — Accepted deals on a venue WE operate, awaiting our cross.
 *   • All             — everything we can see, for history and search.
 *
 * ⚠️ No socket refresh. `emitVaultUpdate` drops plugin-owned scopes, and `dex_deals` is
 * plugin-written, so nothing pushes here — hence the explicit Refresh control (Standard
 * 3.6). Without it a live negotiation reads as dead.
 */
@Component({
  selector: 'app-vault-dex-deals-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    FormsModule, HeaderComponent, LiveIndicatorComponent, RefreshButtonComponent,
    TranslatePipe, PaginatorComponent, MoneyPipe, ModalDealTermsComponent,
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
  private termsModal = inject(ModalDealTermsService);
  utils = inject(UtilsService);
  features = inject(FeaturesService);

  tab = signal<'inbox' | 'approvals' | 'all'>('inbox');
  inbox = signal<DexDeal[]>([]);
  approvals = signal<DexDeal[]>([]);
  all = signal<DexDeal[]>([]);
  refreshing = signal(false);

  search = signal('');
  filterStatus = signal<string>('');
  filterFunding = signal<string>('');
  filterAsset = signal<string>('');

  private sub?: Subscription;

  ngOnInit() {}

  async ionViewDidEnter() {
    await this.refresh();
    // The `dex` scope still fires for order/trade activity; a deal settling produces
    // one, so it is a useful (if partial) nudge. It is NOT a substitute for Refresh.
    this.sub = this.socket.vaultUpdated$.subscribe(p => {
      if (p.type === 'dex' || p.type === 'dex-deal') this.refresh(true);
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async refresh(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show(this.translate.instant('dex.deals.loadingList'));
    try {
      const [inbox, approvals, all] = await Promise.all([
        this.apiService.vaultDexDealsInbox(0, 200),
        this.apiService.vaultDexDealsPendingApproval(0, 200),
        this.apiService.vaultDexDealsList({ start: 0, offset: 200 }),
      ]);
      this.inbox.set(inbox?.deals ?? []);
      this.approvals.set(approvals?.deals ?? []);
      this.all.set(all?.deals ?? []);
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  setTab(t: 'inbox' | 'approvals' | 'all') {
    this.tab.set(t);
    this.page.set(1);
  }

  source = computed<DexDeal[]>(() => {
    switch (this.tab()) {
      case 'inbox':     return this.inbox();
      case 'approvals': return this.approvals();
      default:          return this.all();
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
    return this.source().filter(d =>
      (!status || String(d.status) === status) &&
      (!funding || String(d.funding) === funding) &&
      (!asset || (d.assetSymbol || '').toLowerCase().includes(asset) ||
                 (d.assetName || '').toLowerCase().includes(asset) ||
                 d.baseAsset.toLowerCase().includes(asset)) &&
      (!term ||
        d.dealKey.toLowerCase().includes(term) ||
        (d.assetName || '').toLowerCase().includes(term) ||
        (d.assetSymbol || '').toLowerCase().includes(term) ||
        (d.dexServiceName || '').toLowerCase().includes(term) ||
        (d.counterpartyEntityName || '').toLowerCase().includes(term) ||
        (d.proposerEntityName || '').toLowerCase().includes(term) ||
        d.proposer.toLowerCase().includes(term) ||
        d.counterparty.toLowerCase().includes(term))
    );
  });

  clearFilters() {
    this.search.set('');
    this.filterStatus.set('');
    this.filterFunding.set('');
    this.filterAsset.set('');
    this.page.set(1);
  }

  statusLabel(d: DexDeal)  { return this.translate.instant(DEAL_STATUS_LABEL[d.status] ?? 'common.unknown'); }
  statusClass(d: DexDeal)  { return DEAL_STATUS_CLASS[d.status] ?? 'bg-gray-100 text-gray-700'; }
  sideLabel(d: DexDeal)    { return this.translate.instant(dealSideLabel(d.side)); }
  fundingLabel(d: DexDeal) { return this.translate.instant(dealFundingLabel(d.funding)); }

  /**
   * The far side FROM OUR POINT OF VIEW is not simply `counterparty` — on a deal we
   * proposed it is, but on one proposed TO us the far side is the proposer. Fall back
   * to the address when the chain lookup produced no name.
   */
  otherParty(d: DexDeal): string {
    const weAreCounterparty = this.inbox().some(x => x.dealKey === d.dealKey) && d.lastMover === 1;
    const name = weAreCounterparty ? d.proposerEntityName : d.counterpartyEntityName;
    const addr = weAreCounterparty ? d.proposer : d.counterparty;
    return name || (addr.slice(0, 10) + '…');
  }

  fmtAmount(n: number) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

  /** Time left on the ONE clock (quote validity AND the approval deadline). */
  expiresIn(d: DexDeal): string {
    if (d.isTerminal || !d.expiresAt) return '—';
    const ms = d.expiresAt - Date.now();
    if (ms <= 0) return this.translate.instant('dex.deals.expired');
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m`;
    return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
  }

  view(d: DexDeal) { this.router.navigate(['/authorized/dex/deals/details/' + d.dealKey]); }

  // ─── Propose ────────────────────────────────────────────────────────────────
  //
  // The one write that starts on this page rather than a deal's own. Everything
  // else (counter / accept / decline / withdraw / the operator's decision) needs a
  // deal to act on, so it lives on the detail page.

  canPropose(): boolean {
    return this.authService.userInfo?.role !== 3
      && this.features.systemFunctionEnabled('dex-deal-propose');
  }

  async proposeDeal() {
    if (!this.canPropose()) return;

    // Pull the pickers only when the button is pressed — three list calls on every
    // page load, to populate a form most visits never open, is not worth it.
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

    // A deal is placed BY one of our subscriptions — without one there is nothing to
    // trade from, and the failure would otherwise surface as an opaque revert.
    if (!subs.length) {
      await this.alertService.info(
        this.translate.instant('alerts.error'),
        this.translate.instant('dex.deals.actions.noSubscriptions'),
        this.translate.instant('alerts.ok'), 'max-w-md');
      return;
    }

    const result = await this.termsModal.show({
      mode: 'propose',
      subscriptions: subs.map((s: any) => ({
        address: s.subscription ?? s.address,
        label: [s.serviceName, s.subscription ?? s.address].filter(Boolean).join(' · '),
      })),
      venues: venues.map((v: any) => ({ address: v.serviceAddress, label: v.serviceName || v.serviceAddress })),
      assets: assets.map((a: any) => ({ address: a.address, label: [a.symbol, a.name].filter(Boolean).join(' — ') || a.address })),
      counterparties,
    });
    if (!result) return;

    this.loadingService.show(this.translate.instant('dex.deals.actions.proposing'));
    try {
      const res = await this.apiService.vaultDexDealPropose({
        subscription: result.subscription,
        dexService:   result.dexService!,
        counterparty: result.counterparty!,
        baseAsset:    result.baseAsset!,
        side:         result.side!,
        funding:      result.funding!,
        price:        result.price,
        amount:       result.amount,
        expiresAt:    result.expiresAt!,
      });
      if (res?.error) {
        // Hide BEFORE an awaited alert — the overlay renders ABOVE it and covers its OK button,
        // so `hide()` in `finally` never runs and the only escape is a reload. `hide()` is a
        // plain signal set, so the `finally` calling it again is harmless.
        this.loadingService.hide();
        await this.alertService.info(
          this.translate.instant('alerts.error'), res.error,
          this.translate.instant('alerts.ok'), 'max-w-md');
        return;
      }
      await this.refresh(true);
      // Straight to the new deal: a proposal is the start of a conversation, and the
      // next thing the user wants is to watch for the reply.
      if (res?.dealKey) this.router.navigate(['/authorized/dex/deals/details/' + res.dealKey]);
    } finally { this.loadingService.hide(); }
  }

  exportExcel() {
    const rows = this.filtered().map(d => ({
      'Deal': d.dealKey,
      'Venue': d.dexServiceName || d.dexService,
      'Asset': d.assetSymbol || d.baseAsset,
      'Proposer Side': this.sideLabel(d),
      'Funding': this.fundingLabel(d),
      'Status': this.statusLabel(d),
      'Round': d.round,
      'Amount': this.fmtAmount(d.amount),
      'Price': this.utils.roundMoney(d.price),
      'Total': this.utils.roundMoney(d.amount * d.price),
      'Currency': d.currencyName || d.currencyCode,
      'Counterparty': d.counterpartyEntityName || d.counterparty,
      'Suspended': d.suspended ? 'Yes' : 'No',
      'Expires': d.expiresAt ? this.utils.formatTime(d.expiresAt) : '—',
      'Updated': d.updatedAt ? this.utils.formatTime(d.updatedAt) : '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DEX Deals');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `dex_deals_${stamp}.xlsx`);
  }

  exportPdf() {
    const deals = this.filtered();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('DEX Negotiated Deals', pad, 15);
    autoTable(doc, {
      startY: 28,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [['#', 'Venue', 'Asset', 'Side', 'Funding', 'Status', 'Rnd', 'Amount', 'Price', 'Counterparty', 'Expires']],
      body: deals.map((d, i) => [
        String(i + 1),
        d.dexServiceName || d.dexService.slice(0, 10),
        d.assetSymbol || d.baseAsset.slice(0, 10),
        this.sideLabel(d),
        this.fundingLabel(d),
        this.statusLabel(d),
        String(d.round),
        this.fmtAmount(d.amount),
        this.utils.formatPrice(d.price),
        d.counterpartyEntityName || d.counterparty.slice(0, 10),
        d.expiresAt ? this.utils.formatTime(d.expiresAt) : '—',
      ]),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`dex_deals_${stamp}.pdf`);
  }
}
