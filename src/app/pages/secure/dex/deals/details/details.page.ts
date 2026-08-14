import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
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
import { DexDeal, DexDealRound } from '../../../../../shared/models/data.model';
import { ModalDealTermsComponent } from '../modals/modal-deal-terms/modal-deal-terms.component';
import { ModalDealTermsService } from '../modals/modal-deal-terms/modal-deal-terms.service';
import { ModalDealReasonComponent } from '../modals/modal-deal-reason/modal-deal-reason.component';
import { ModalDealReasonService } from '../modals/modal-deal-reason/modal-deal-reason.service';
import {
  DEAL_STATUS_LABEL, DEAL_STATUS_CLASS, DEAL_ACTION_LABEL, DEAL_ACTION_CLASS,
  dealSideLabel, dealFundingLabel,
} from '../deal-labels';
import { PaginatorComponent, pageSlice } from '../../../../../shared/components/paginator/paginator.component';

/**
 * One negotiated deal: its terms, its two escrow legs, and the round-by-round trail.
 *
 * The trail is the point of this page. A deal's current terms tell you nothing about
 * how they were reached, and in an OTC market the path (who moved, by how much, how
 * often) is what an operator and an auditor both need. It renders OLDEST FIRST — the
 * API orders it that way because it reads as a narrative, not as a feed.
 */
@Component({
  selector: 'app-vault-dex-deal-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [
    HeaderComponent, LiveIndicatorComponent, RefreshButtonComponent, RouterLink, TranslatePipe, MoneyPipe,
    ModalDealTermsComponent, ModalDealReasonComponent,
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
  private termsModal = inject(ModalDealTermsService);
  private reasonModal = inject(ModalDealReasonService);
  features = inject(FeaturesService);
  utils = inject(UtilsService);

  dealKey = signal<string>('');
  deal = signal<DexDeal | undefined>(undefined);
  rounds = signal<DexDealRound[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  roundsPage = signal(1);
  roundsPageSize = signal(25);
  pagedRounds = computed(() => pageSlice(this.rounds(), this.roundsPage(), this.roundsPageSize()));
  refreshing = signal(false);
  tab = signal<'terms' | 'rounds' | 'settlement'>('terms');

  /** Our own subscriptions, used to decide which side of a deal (if either) is ours. */
  private mySubscriptions = signal<Set<string>>(new Set());
  /** Our own venues, for the operator-approval gate. */
  private myVenues = signal<Set<string>>(new Set());

  private sub?: Subscription;

  constructor() {
    const key = this.route.snapshot.paramMap.get('key');
    if (key) this.dealKey.set(key);
  }

  ngOnInit() {}

  async ionViewWillEnter() {
    await Promise.all([this.load(), this.loadOwnership()]);
    this.sub = this.socket.vaultUpdated$.subscribe(p => {
      if (p.type === 'dex' || p.type === 'dex-deal') this.load(true);
    });
  }

  /**
   * Which side of this deal is OURS, and do we run the venue.
   *
   * Resolved from our own mirrors rather than from the deal row: `dex_deals` names
   * two subscriptions and a venue, and nothing on that row says which are ours — a
   * deal reaches this tenant as trader on either side, as venue operator, or both.
   * Non-fatal: a failed load just leaves the action buttons hidden, which is the
   * safe direction (the API and the contract both re-check anyway).
   */
  private async loadOwnership() {
    try {
      const [subs, venues] = await Promise.all([
        this.apiService.vaultGetSubscriptions(undefined, 0, 1000),
        this.apiService.vaultDexVenuesList(1, 200),
      ]);
      this.mySubscriptions.set(new Set(
        (subs?.subscriptions ?? []).map((s: any) => String(s.subscription ?? s.address ?? '').toLowerCase())));
      this.myVenues.set(new Set(
        (venues?.venues ?? []).map((v: any) => String(v.serviceAddress ?? '').toLowerCase())));
    } catch { /* leave both empty — actions stay hidden */ }
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async load(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show(this.translate.instant('dex.deals.loadingOne'));
    try {
      const r = await this.apiService.vaultDexDealInfo(this.dealKey());
      if (r) { this.deal.set(r.deal); this.rounds.set(r.rounds); }
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  statusLabel(d: DexDeal)  { return this.translate.instant(DEAL_STATUS_LABEL[d.status] ?? 'common.unknown'); }
  statusClass(d: DexDeal)  { return DEAL_STATUS_CLASS[d.status] ?? 'bg-gray-100 text-gray-700'; }
  sideLabel(d: DexDeal)    { return this.translate.instant(dealSideLabel(d.side)); }
  fundingLabel(d: DexDeal) { return this.translate.instant(dealFundingLabel(d.funding)); }
  actionLabel(r: DexDealRound) { return this.translate.instant(DEAL_ACTION_LABEL[r.action] ?? 'common.unknown'); }
  actionClass(r: DexDealRound) { return DEAL_ACTION_CLASS[r.action] ?? 'bg-gray-100 text-gray-700'; }

  fmtAmount(n: number | null) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  /** Bearing matters to the reader: OnTop is charged above the notional, Deducted comes out of it. */
  bearingLabel(bearing: number) {
    return this.translate.instant(bearing === 0 ? 'dex.deals.bearing.onTop' : 'dex.deals.bearing.deducted');
  }

  /** Whose quote is live — the side that may be countered or accepted, never its own author. */
  lastMoverLabel(d: DexDeal) {
    return this.translate.instant(d.lastMover === 1 ? 'dex.deals.mover.proposer' : 'dex.deals.mover.counterparty');
  }

  /**
   * Escrow is live only while a deal is in flight; every terminal status returns it.
   * Showing a stale locked amount on a closed deal is how an operator concludes their
   * capital is still trapped when it is not.
   */
  showsEscrow(d: DexDeal) { return !d.isTerminal && (d.creditWithheld > 0 || d.assetWithheld > 0); }

  // ═══ Actions ═══════════════════════════════════════════════════════════════
  //
  // Who may do what is decided entirely by `lastMover` — it names whose quote is
  // LIVE, and therefore who may counter, accept or decline it (the other side) and
  // who may withdraw it (its author). You can never act on your own live quote;
  // amending means withdraw + re-propose, which is what keeps `lastMover` honest.

  private isMine(sub: string) { return this.mySubscriptions().has(String(sub || '').toLowerCase()); }

  /** The subscription of OURS that is party to this deal, if any. */
  ourSubscription(): string {
    const d = this.deal();
    if (!d) return '';
    if (this.isMine(d.proposer)) return d.proposer;
    if (this.isMine(d.counterparty)) return d.counterparty;
    return '';
  }

  /** Are we the side whose quote is currently live? */
  private weAreLastMover(): boolean {
    const d = this.deal();
    if (!d) return false;
    const live = d.lastMover === 1 ? d.proposer : d.counterparty;
    return this.isMine(live);
  }

  private weAreProposer(): boolean {
    const d = this.deal();
    return !!d && this.isMine(d.proposer);
  }

  private notViewer() { return this.authService.userInfo?.role !== 3; }

  weOperateVenue(): boolean {
    const d = this.deal();
    return !!d && this.myVenues().has(String(d.dexService || '').toLowerCase());
  }

  /** Our turn: the deal is live, we are party to it, and the quote on the table is theirs. */
  canRespond(): boolean {
    const d = this.deal();
    return !!d && d.status === 1 && !!this.ourSubscription() && !this.weAreLastMover() && this.notViewer();
  }

  /** Only the author of the live quote can pull it, and only before it is accepted. */
  canWithdraw(): boolean {
    const d = this.deal();
    return !!d && d.status === 1 && this.weAreLastMover() && this.notViewer()
      && this.features.systemFunctionEnabled('dex-deal-withdraw');
  }

  canCounter() { return this.canRespond() && this.features.systemFunctionEnabled('dex-deal-counter'); }
  canDecline() { return this.canRespond() && this.features.systemFunctionEnabled('dex-deal-decline'); }

  /** Accept is the one response a regulator suspension blocks. */
  canAccept(): boolean {
    const d = this.deal();
    return this.canRespond() && !d?.suspended && this.features.systemFunctionEnabled('dex-deal-accept');
  }

  /** The operator's pre-trade decision, available only once BOTH sides have agreed. */
  canDecide(): boolean {
    const d = this.deal();
    return !!d && d.status === 2 && this.weOperateVenue() && this.notViewer()
      && this.features.systemFunctionEnabled('dex-deal-venue-decision');
  }

  /** Approve settles; reject releases. Only approve is blocked by a suspension. */
  canApprove() { return this.canDecide() && !this.deal()?.suspended; }

  private dealLabel(): string {
    const d = this.deal();
    if (!d) return '';
    return [d.assetSymbol || d.assetName, d.dexServiceName].filter(Boolean).join(' · ');
  }

  /**
   * One place to run a write. Every action sends `expectedRound` — the round this page
   * RENDERED — so a counter that landed between the render and the click comes back as
   * a 409 instead of settling on terms nobody agreed. That is the whole reason the
   * field exists; do not drop it to "simplify" a call site.
   */
  private async run(label: string, fn: () => Promise<any>) {
    this.loadingService.show(this.translate.instant(label));
    try {
      const res = await fn();
      if (res?.error) {
        // hideCancel — these are informational, so a Cancel button would be noise.
        await this.alertService.show(
          this.translate.instant('alerts.error'), res.error,
          this.translate.instant('alerts.ok'), 'max-w-md', true);
        // A 409 means our view was stale, so pull the current one immediately rather
        // than leaving the user staring at terms that no longer exist.
        await this.load(true);
        return false;
      }
      if (res?.requestId) {
        await this.alertService.show(
          this.translate.instant('approvals.submittedTitle'),
          this.translate.instant('approvals.submittedMessage'),
          this.translate.instant('alerts.ok'), 'max-w-md', true);
        return true;
      }
      // dex_deals is plugin-written, so the mirror trails the receipt by a block.
      // Reload rather than patching the signal — a locally-advanced status the plugin
      // has not written yet is exactly the stale view Refresh exists to avoid.
      await this.load(true);
      return true;
    } finally { this.loadingService.hide(); }
  }

  async counterDeal() {
    const d = this.deal();
    if (!d || !this.canCounter()) return;
    const mine = this.ourSubscription();
    const result = await this.termsModal.show({
      mode: 'counter',
      subscriptions: [{ address: mine, label: mine }],
      currentPrice: d.price,
      currentAmount: d.amount,
      currentSide: d.side,
      currentFunding: d.funding,
      weAreProposer: this.weAreProposer(),
      assetLabel: this.dealLabel(),
      currencyLabel: d.currencyName || String(d.currencyCode),
    });
    if (!result) return;
    await this.run('dex.deals.actions.countering', () =>
      this.apiService.vaultDexDealCounter(d.dealKey, {
        subscription: result.subscription, price: result.price, amount: result.amount,
        expectedRound: d.round,
      }));
  }

  async acceptDeal() {
    const d = this.deal();
    if (!d || !this.canAccept()) return;
    // Indicative funding means the quoter's money is pulled AT THIS MOMENT and the
    // call can revert if they have spent it. Say so before the click, not after.
    const body = d.funding === 2
      ? this.translate.instant('dex.deals.actions.acceptConfirmIndicative')
      : this.translate.instant('dex.deals.actions.acceptConfirmFirm');
    const ok = await this.alertService.show(
      this.translate.instant('dex.deals.actions.acceptConfirmTitle'), body,
      this.translate.instant('dex.deals.actions.accept'));
    if (!ok) return;
    await this.run('dex.deals.actions.accepting', () =>
      this.apiService.vaultDexDealAccept(d.dealKey, this.ourSubscription(), d.round));
  }

  async declineDeal() {
    const d = this.deal();
    if (!d || !this.canDecline()) return;
    const result = await this.reasonModal.show('decline', this.dealLabel());
    if (!result) return;
    await this.run('dex.deals.actions.declining', () =>
      this.apiService.vaultDexDealDecline(d.dealKey, this.ourSubscription(), result.reason, d.round));
  }

  async withdrawDeal() {
    const d = this.deal();
    if (!d || !this.canWithdraw()) return;
    const result = await this.reasonModal.show('withdraw', this.dealLabel());
    if (!result) return;
    await this.run('dex.deals.actions.withdrawing', () =>
      this.apiService.vaultDexDealWithdraw(d.dealKey, this.ourSubscription(), result.reason, d.round));
  }

  async approveCross() {
    const d = this.deal();
    if (!d || !this.canApprove()) return;
    const ok = await this.alertService.show(
      this.translate.instant('dex.deals.actions.approveConfirmTitle'),
      this.translate.instant('dex.deals.actions.approveConfirmMsg'),
      this.translate.instant('dex.deals.actions.approve'));
    if (!ok) return;
    await this.run('dex.deals.actions.approving', () =>
      this.apiService.vaultDexDealVenueApprove(d.dealKey, '', d.round));
  }

  async rejectCross() {
    const d = this.deal();
    if (!d || !this.canDecide()) return;
    const result = await this.reasonModal.show('venue-reject', this.dealLabel());
    if (!result) return;
    await this.run('dex.deals.actions.rejecting', () =>
      this.apiService.vaultDexDealVenueReject(d.dealKey, result.reason, d.round));
  }

  goAsset(address: string) { this.router.navigate(['/authorized/assets/details/' + address]); }
  goVenue(address: string) { this.router.navigate(['/authorized/dex/venues/details/' + address]); }
  goTrade(tradeId: number) { this.router.navigate(['/authorized/dex/trades/details/' + tradeId]); }
  goOrder(orderId: number) { this.router.navigate(['/authorized/dex/orders/details/' + orderId]); }
}
