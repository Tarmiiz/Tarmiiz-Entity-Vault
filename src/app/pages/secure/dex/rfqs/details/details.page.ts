import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { HeaderComponent } from '../../../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../../../shared/components/live-indicator/live-indicator.component';
import { RefreshButtonComponent } from '../../../../../shared/components/refresh-button/refresh-button.component';
import { ApiService } from '../../../../../shared/services/api.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { SocketService } from '../../../../../shared/services/socket.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { MoneyPipe } from '../../../../../shared/pipes/money.pipe';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { DexRfqRequest, DexRfqDealer, DexDeal } from '../../../../../shared/models/data.model';
import { ModalRfqQuoteComponent } from '../modals/modal-rfq-quote/modal-rfq-quote.component';
import { ModalRfqQuoteService } from '../modals/modal-rfq-quote/modal-rfq-quote.service';
import { ModalDealReasonComponent } from '../../deals/modals/modal-deal-reason/modal-deal-reason.component';
import { ModalDealReasonService } from '../../deals/modals/modal-deal-reason/modal-deal-reason.service';
import {
  RFQ_STATUS_LABEL, RFQ_STATUS_CLASS, RFQ_DEALER_STATE_LABEL, RFQ_DEALER_STATE_CLASS,
  rfqSideLabel, rfqDealerSideLabel, rfqFundingLabel, isBetterQuote,
} from '../rfq-labels';
import { DEAL_STATUS_LABEL, DEAL_STATUS_CLASS } from '../../deals/deal-labels';
import { PaginatorComponent, pageSlice } from '../../../../../shared/components/paginator/paginator.component';

/**
 * One request for quote: its fixed terms, the dealer board, and the quotes themselves.
 *
 * The quotes are ORDINARY DEALS — that is what an RFQ is — so they are loaded from the
 * deals surface with a `request` filter rather than from an RFQ-specific endpoint that
 * would only duplicate them. Awarding is `accept` on the winning one.
 *
 * ⚠️ The board is a SEALED AUCTION. The API mirrors every dealer row only when this
 * tenant operates the venue or made the request; as an invited dealer we get our own
 * row alone. So never derive "how many answered" from `dealers()` — the header's
 * quoteCount is the authoritative number and is shown to everyone.
 */
@Component({
  selector: 'app-vault-dex-rfq-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [
    HeaderComponent, LiveIndicatorComponent, RefreshButtonComponent, RouterLink, TranslatePipe, MoneyPipe,
    ModalRfqQuoteComponent, ModalDealReasonComponent,
    PaginatorComponent,
  ],
})
export class DetailsPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private translate = inject(TranslateService);
  private socket = inject(SocketService);
  private alertService = inject(AlertService);
  private authService = inject(AuthService);
  private quoteModal = inject(ModalRfqQuoteService);
  private reasonModal = inject(ModalDealReasonService);
  features = inject(FeaturesService);
  utils = inject(UtilsService);

  requestKey = signal<string>('');
  request = signal<DexRfqRequest | undefined>(undefined);
  dealers = signal<DexRfqDealer[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  dealersPage = signal(1);
  dealersPageSize = signal(25);
  pagedDealers = computed(() => pageSlice(this.dealers(), this.dealersPage(), this.dealersPageSize()));
  quotes = signal<DexDeal[]>([]);
  refreshing = signal(false);
  tab = signal<'terms' | 'board'>('board');

  /** Our own subscriptions — used to decide whether we are the requester or a dealer. */
  private mySubscriptions = signal<Set<string>>(new Set());

  private sub?: Subscription;

  constructor() {
    const key = this.route.snapshot.paramMap.get('key');
    if (key) this.requestKey.set(key);
  }

  ngOnInit() {}

  async ionViewWillEnter() {
    await Promise.all([this.load(), this.loadOwnership()]);
    this.sub = this.socket.vaultUpdated$.subscribe(p => {
      if (p.type === 'dex' || p.type === 'dex-rfq' || p.type === 'dex-deal') this.load(true);
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  /**
   * Which side of this request is ours. Resolved from our own subscription mirror,
   * because nothing on the request row says so — a request reaches this tenant as its
   * requester, as an invited dealer, or as the venue operator. Non-fatal: a failed
   * load just leaves the actions hidden, which is the safe direction.
   */
  private async loadOwnership() {
    try {
      const subs = await this.apiService.vaultGetSubscriptions(undefined, 0, 1000);
      this.mySubscriptions.set(new Set(
        (subs?.subscriptions ?? []).map((s: any) => String(s.subscription ?? s.address ?? '').toLowerCase())));
    } catch { /* leave empty — actions stay hidden */ }
  }

  async load(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show(this.translate.instant('dex.rfqs.loadingOne'));
    try {
      const r = await this.apiService.vaultDexRfqInfo(this.requestKey());
      if (r) { this.request.set(r.request); this.dealers.set(r.dealers); }
      // The quotes ARE deals — read them from the deals surface rather than duplicating
      // their terms onto the RFQ endpoints.
      const q = await this.apiService.vaultDexDealsList({ request: this.requestKey(), start: 0, offset: 200 });
      this.quotes.set(q?.deals ?? []);
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  statusLabel(q: DexRfqRequest)  { return this.translate.instant(RFQ_STATUS_LABEL[q.status] ?? 'common.unknown'); }
  statusClass(q: DexRfqRequest)  { return RFQ_STATUS_CLASS[q.status] ?? 'bg-gray-100 text-gray-700'; }
  sideLabel(q: DexRfqRequest)    { return this.translate.instant(rfqSideLabel(q.side)); }
  fundingLabel(q: DexRfqRequest) { return this.translate.instant(rfqFundingLabel(q.funding)); }

  dealerStateLabel(d: DexRfqDealer) { return this.translate.instant(RFQ_DEALER_STATE_LABEL[d.state] ?? 'common.unknown'); }
  dealerStateClass(d: DexRfqDealer) { return RFQ_DEALER_STATE_CLASS[d.state] ?? 'bg-gray-100 text-gray-700'; }
  dealerName(d: DexRfqDealer) { return d.dealerEntityName || (d.dealer.slice(0, 10) + '…'); }

  quoteStatusLabel(s: number | null) {
    return s == null ? '—' : this.translate.instant(DEAL_STATUS_LABEL[s] ?? 'common.unknown');
  }
  quoteStatusClass(s: number | null) {
    return s == null ? 'bg-gray-100 text-gray-700' : (DEAL_STATUS_CLASS[s] ?? 'bg-gray-100 text-gray-700');
  }

  fmtAmount(n: number | null) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  expiresIn(): string {
    const q = this.request();
    if (!q || !q.isOpen || !q.expiresAt) return '—';
    const ms = q.expiresAt - Date.now();
    if (ms <= 0) return this.translate.instant('dex.deals.expired');
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m`;
    return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
  }

  /**
   * The best LIVE quote, from the requester's point of view — lowest when we are
   * buying, highest when selling. Computed over the live rows only: a withdrawn or
   * expired quote is not on the table, and highlighting one as "best" would invite an
   * award that reverts.
   */
  bestQuotePrice = computed<number | null>(() => {
    const q = this.request();
    if (!q) return null;
    let best: number | null = null;
    for (const d of this.dealers()) {
      if (d.state !== 2 || d.quotePrice == null || d.quoteStatus !== 1) continue;
      if (best === null || isBetterQuote(q.side, d.quotePrice, best)) best = d.quotePrice;
    }
    return best;
  });

  isBest(d: DexRfqDealer): boolean {
    const best = this.bestQuotePrice();
    return best !== null && d.quotePrice === best && d.state === 2 && d.quoteStatus === 1;
  }

  // ═══ Actions ═══════════════════════════════════════════════════════════════

  private isMine(sub: string) { return this.mySubscriptions().has(String(sub || '').toLowerCase()); }
  private notViewer() { return this.authService.userInfo?.role !== 3; }

  weAreRequester(): boolean {
    const q = this.request();
    return !!q && this.isMine(q.requester);
  }

  /** Our own board row, if the API let us see one. */
  ourDealerRow(): DexRfqDealer | undefined {
    return this.dealers().find(d => this.isMine(d.dealer));
  }

  /** The quote WE submitted, if any — the row we may withdraw through the deals page. */
  ourQuote(): DexDeal | undefined {
    return this.quotes().find(d => this.isMine(d.proposer));
  }

  /**
   * May we answer? Open, not suspended, not ours, and either we hold an invite or the
   * request is open to any admitted trader. A second quote from the same subscription
   * is refused on chain, so an existing one closes the door.
   */
  canQuote(): boolean {
    const q = this.request();
    if (!q || !q.isOpen || q.suspended || this.weAreRequester() || !this.notViewer()) return false;
    if (this.ourQuote()) return false;
    if (!q.openToAll && !this.ourDealerRow()) return false;
    return this.features.systemFunctionEnabled('dex-rfq-quote');
  }

  /** Awarding is the requester's, on an open request, and only over a live quote. */
  canAward(): boolean {
    const q = this.request();
    return !!q && q.isOpen && !q.suspended && this.weAreRequester() && this.notViewer()
      && this.features.systemFunctionEnabled('dex-rfq-award');
  }

  /** Cancelling stays available while suspended — it is a RELEASING path. */
  canCancel(): boolean {
    const q = this.request();
    return !!q && q.isOpen && this.weAreRequester() && this.notViewer()
      && this.features.systemFunctionEnabled('dex-rfq-cancel');
  }

  isAwardable(d: DexRfqDealer): boolean {
    return this.canAward() && d.state === 2 && d.quoteStatus === 1 && !!d.dealKey;
  }

  private requestLabel(): string {
    const q = this.request();
    if (!q) return '';
    return [q.assetSymbol || q.assetName, q.dexServiceName].filter(Boolean).join(' · ');
  }

  /** One place to run a write — mirrors the deals page's `run`. */
  private async run(label: string, fn: () => Promise<any>) {
    this.loadingService.show(this.translate.instant(label));
    try {
      const res = await fn();
      if (res?.error) {
        this.loadingService.hide();
        await this.alertService.info(
          this.translate.instant('alerts.error'), res.error,
          this.translate.instant('alerts.ok'), 'max-w-md');
        // A 409 means our view was stale — pull the current one rather than leaving the
        // user looking at a board that no longer exists.
        await this.load(true);
        return false;
      }
      if (res?.requestId) {
        this.loadingService.hide();
        await this.alertService.info(
          this.translate.instant('approvals.submittedTitle'),
          this.translate.instant('approvals.submittedMessage'),
          this.translate.instant('alerts.ok'), 'max-w-md');
        return true;
      }
      // The mirror is plugin-written and trails the receipt by a block, so reload
      // rather than patching signals locally.
      await this.load(true);
      return true;
    } finally { this.loadingService.hide(); }
  }

  async submitQuote() {
    const q = this.request();
    if (!q || !this.canQuote()) return;

    const subs = await this.apiService.vaultGetSubscriptions(undefined, 0, 1000);
    // Only a subscription that may actually answer: the one holding the invite, or any
    // of ours when the request is open to all. Offering the rest would produce a revert.
    const row = this.ourDealerRow();
    const eligible = (subs?.subscriptions ?? [])
      .map((s: any) => ({ address: String(s.subscription ?? s.address ?? ''), label: [s.serviceName, s.subscription ?? s.address].filter(Boolean).join(' · ') }))
      .filter((s: any) => q.openToAll ? s.address.toLowerCase() !== q.requester.toLowerCase()
                                      : s.address.toLowerCase() === String(row?.dealer || '').toLowerCase());
    if (!eligible.length) {
      await this.alertService.info(
        this.translate.instant('alerts.error'),
        this.translate.instant('dex.rfqs.actions.noEligibleSubscription'),
        this.translate.instant('alerts.ok'), 'max-w-md');
      return;
    }

    const result = await this.quoteModal.show({
      subscriptions: eligible,
      assetLabel: this.requestLabel(),
      currencyLabel: q.currencyName || String(q.currencyCode),
      amount: q.amount,
      dealerSideLabel: rfqDealerSideLabel(q.side),
      funding: q.funding,
      expiresAt: q.expiresAt,
    });
    if (!result) return;

    await this.run('dex.rfqs.actions.quoting', () =>
      this.apiService.vaultDexRfqQuote(q.requestKey, result.subscription, result.price));
  }

  async award(d: DexRfqDealer) {
    const q = this.request();
    if (!q || !this.isAwardable(d)) return;

    // Awarding locks BOTH sides regardless of funding and still needs the venue
    // operator's approval before it settles — say both before the click.
    const ok = await this.alertService.show(
      this.translate.instant('dex.rfqs.actions.awardConfirmTitle'),
      this.translate.instant('dex.rfqs.actions.awardConfirmMsg', {
        dealer: this.dealerName(d),
        price: d.quotePrice,
      }),
      this.translate.instant('dex.rfqs.actions.award'));
    if (!ok) return;

    await this.run('dex.rfqs.actions.awarding', () =>
      this.apiService.vaultDexRfqAward(q.requestKey, q.requester, d.dealKey, d.quoteRound ?? undefined));
  }

  async cancelRequest() {
    const q = this.request();
    if (!q || !this.canCancel()) return;
    const result = await this.reasonModal.show('withdraw', this.requestLabel());
    if (!result) return;
    await this.run('dex.rfqs.actions.cancelling', () =>
      this.apiService.vaultDexRfqCancel(q.requestKey, q.requester, result.reason));
  }

  goAsset(address: string) { this.router.navigate(['/authorized/assets/details/' + address]); }
  goVenue(address: string) { this.router.navigate(['/authorized/dex/venues/details/' + address]); }
  goDeal(key: string) { this.router.navigate(['/authorized/dex/deals/details/' + key]); }
}
