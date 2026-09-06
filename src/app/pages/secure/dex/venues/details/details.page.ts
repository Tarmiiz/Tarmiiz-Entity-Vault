import { Component, inject, OnDestroy, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ethers } from 'ethers';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";
import { LiveIndicatorComponent } from "../../../../../shared/components/live-indicator/live-indicator.component";
import { ApiService } from '../../../../../shared/services/api.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { SocketService } from '../../../../../shared/services/socket.service';
import { ModalServiceFeeConfigService } from '../../../services/modals/modal-service-fee-config/modal-service-fee-config.service';
import { ModalServiceFeeConfigComponent } from '../../../services/modals/modal-service-fee-config/modal-service-fee-config.component';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { DexVenue, DexOrder, DexTrade, DexVenueMember } from '../../../../../shared/models/data.model';

import { ModalVenueStateService } from '../modals/modal-venue-state/modal-venue-state.service';
import { ModalVenueStateComponent } from '../modals/modal-venue-state/modal-venue-state.component';
import { PaginatorComponent, pageSlice } from '../../../../../shared/components/paginator/paginator.component';

@Component({
  selector: 'app-dex-venue-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, LiveIndicatorComponent, RouterLink, ModalVenueStateComponent, ModalServiceFeeConfigComponent, TranslatePipe, PaginatorComponent],
})
export class DetailsPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private socket = inject(SocketService);
  utils = inject(UtilsService);
  features = inject(FeaturesService);
  private stateModal = inject(ModalVenueStateService);
  private feeConfigModal = inject(ModalServiceFeeConfigService);
  private authService = inject(AuthService);
  private translate = inject(TranslateService);

  get userInfo() { return this.authService.userInfo; }

  serviceAddress = signal<string>('');
  venue = signal<DexVenue | undefined>(undefined);
  activeTab = signal<'info' | 'assets' | 'orders' | 'trades' | 'members' | 'contract'>('info');

  // ── The venue CONTRACT (Phase 16 A6) ───────────────────────────────────────
  //
  // Until this shipped there was no way to bind a venue contract from anywhere in the
  // product, so every venue answered `venueAct` with "venue has no contract bound".
  //
  // ⚠️ THE VAULT DOES NOT BUILD THE CREATION CODE, deliberately. Per the platform ruling
  // the operator brings fixed, reviewable code from the downloadable kit; the platform
  // neither generates nor holds an implementation. What this page adds is the two things
  // that were genuinely missing: the published kit-library addresses to link against, and
  // a route to a CREATE that the tenant relay wallet cannot perform itself.
  venueTemplates = signal<any[]>([]);
  kitLibraries = signal<Record<string, string | null>>({});
  kitLibraryList = computed(() => Object.entries(this.kitLibraries()).map(([name, address]) => ({ name, address })));
  contractCandidate = '';
  contractCreationCode = '';
  contractName = '';
  verifyReport = signal<any | null>(null);
  contractBusy = signal(false);
  venueOrders = signal<DexOrder[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  vOrdersPage = signal(1);
  vOrdersPageSize = signal(25);
  pagedVOrders = computed(() => pageSlice(this.venueOrders(), this.vOrdersPage(), this.vOrdersPageSize()));
  venueTrades = signal<DexTrade[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  vTradesPage = signal(1);
  vTradesPageSize = signal(25);
  pagedVTrades = computed(() => pageSlice(this.venueTrades(), this.vTradesPage(), this.vTradesPageSize()));
  venueAssets = signal<any[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  vAssetsPage = signal(1);
  vAssetsPageSize = signal(25);
  pagedVAssets = computed(() => pageSlice(this.venueAssets(), this.vAssetsPage(), this.vAssetsPageSize()));
  venueMembers = signal<DexVenueMember[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  vMembersPage = signal(1);
  vMembersPageSize = signal(25);
  pagedVMembers = computed(() => pageSlice(this.venueMembers(), this.vMembersPage(), this.vMembersPageSize()));
  refreshing = signal(false);

  // Add Member inline modal

  // Venue hosting (2026-08-09) — the halt/resume reason prompt. AlertService.show
  // only returns a boolean, so a reason needs its own modal; this mirrors the
  // inline add-member one above rather than pulling in a shared component.
  haltModalOpen = signal(false);
  haltTarget = signal<{ baseAsset: string; assetName?: string; halted: boolean } | null>(null);
  haltReason = '';

  private sub?: Subscription;

  constructor() {
    const address = this.route.snapshot.paramMap.get('address');
    if (address) this.serviceAddress.set(address);
  }

  ngOnInit() {}

  async ionViewWillEnter() {
    await this.loadVenue();
    await Promise.all([this.loadOrders(), this.loadTrades(), this.loadAssets(), this.loadMembers()]);
    this.sub = this.socket.vaultUpdated$.subscribe(async p => {
      const isRelevant = p.type === 'dex-venue' || p.type === 'dex-order' || p.type === 'dex-trade' || p.type === 'dex-asset-venue';
      if (!isRelevant) return;
      this.refreshing.set(true);
      try {
        // Member add/accept/remove notify on the dex-venue scope too.
        if (p.type === 'dex-venue') { await this.loadVenue(true); await this.loadMembers(); }
        if (p.type === 'dex-order') await this.loadOrders();
        if (p.type === 'dex-trade') await this.loadTrades();
        if (p.type === 'dex-asset-venue') await this.loadAssets();
      } finally {
        this.refreshing.set(false);
      }
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async loadVenue(silent = false) {
    if (!silent) this.loadingService.show(this.translate.instant('dex.venues.details.loadingVenue'));
    const data = await this.apiService.vaultDexVenueInfo(this.serviceAddress());
    this.venue.set(data);
    if (!silent) this.loadingService.hide();
  }

  async loadOrders() {
    const r = await this.apiService.vaultDexOrdersList({ venue: this.serviceAddress(), offset: 200 });
    if (r?.orders) this.venueOrders.set(r.orders);
  }

  async loadTrades() {
    const r = await this.apiService.vaultDexTradesList({ venue: this.serviceAddress(), offset: 200 });
    if (r?.trades) this.venueTrades.set(r.trades);
  }

  async loadAssets() {
    const r = await this.apiService.vaultDexVenueAssets(this.serviceAddress());
    this.venueAssets.set(r?.assets || []);
  }

  async loadMembers() {
    const r = await this.apiService.vaultDexVenueMembers(this.serviceAddress());
    this.venueMembers.set(r?.members || []);
  }

  setTab(tab: 'info' | 'assets' | 'orders' | 'trades' | 'members' | 'contract') {
    this.activeTab.set(tab);
    if (tab === 'contract' && this.venueTemplates().length === 0) void this.loadTemplates();
  }

  // ── The venue CONTRACT ─────────────────────────────────────────────────────

  async loadTemplates() {
    const r = await this.apiService.vaultDexVenueTemplates();
    this.venueTemplates.set(r?.templates ?? []);
    this.kitLibraries.set(r?.libraries ?? {});
  }

  /**
   * The venue must be halted before its contract can change, and this is the check an
   * operator otherwise discovers as a 409 mid-flow. Mirrors the contract's own
   * `state != 2 || suspended`.
   */
  contractChangeBlocked = computed(() => {
    const v = this.venue();
    return !!v && Number(v.state) === 2 && !v.suspended;
  });

  /**
   * ⚠️ EVERY ALERT BELOW IS INFORMATIONAL AND SO PASSES `hideCancel = true` (the 5th arg).
   *
   * These report on something that has ALREADY happened — an on-chain bind, a failed read.
   * A "Cancel" button on them is not merely redundant, it says the action can still be
   * undone, which for a mined transaction is false. `AlertService.show`'s own comment
   * reserves the flag for exactly this. Only the three CONFIRMATION prompts
   * (deploy / bind / unbind) legitimately offer Cancel, because there the answer still
   * decides whether anything happens.
   */
  private notify(titleKey: string, message: string) {
    return this.alertService.show(
      this.translate.instant(titleKey), message,
      this.translate.instant('alerts.ok'), 'max-w-md', true,
    );
  }

  async verifyCandidate() {
    const addr = this.contractCandidate.trim();
    if (!addr) return;
    this.contractBusy.set(true);
    this.verifyReport.set(null);
    try {
      const r = await this.apiService.vaultDexVenueContractVerify(this.serviceAddress(), addr);
      if (r?.error) { this.notify('alerts.error', r.error); return; }
      // A failing report is a RESULT, not an error — it is rendered, not thrown away.
      this.verifyReport.set(r);
    } finally { this.contractBusy.set(false); }
  }

  /** Shared tail for the three write paths — they differ only in payload and prompt. */
  private async _setContract(body: { creationCode?: string; name?: string; venueContract?: string | null }, loadingKey: string) {
    this.loadingService.show(this.translate.instant(loadingKey));
    try {
      const r = await this.apiService.vaultDexVenueContractSet(this.serviceAddress(), body);
      if (r?.error) { this.notify('alerts.error', r.error); return; }
      if (r?.requestId) {
        this.notify('approvals.submittedTitle', this.translate.instant('approvals.submittedMessage'));
        return;
      }
      // ⚠️ SURFACE THE NOTICE, always. A successful bind AUTO-SUSPENDS the venue by
      // design; an operator who is not told reads their own dark venue as a failure of
      // this action and goes looking for a bug.
      if (r?.notice) {
        this.notify('dex.venues.contract.doneTitle', r.notice);
      }
      this.contractCreationCode = '';
      this.contractCandidate = '';
      this.verifyReport.set(null);
      await this.loadVenue();
    } finally { this.loadingService.hide(); }
  }

  async deployAndBind() {
    const code = this.contractCreationCode.trim();
    if (!code) return;
    const ok = await this.alertService.show(
      this.translate.instant('dex.venues.contract.deployTitle'),
      this.translate.instant('dex.venues.contract.deployConfirm'),
      this.translate.instant('dex.venues.contract.deployAction'),
    );
    if (!ok) return;
    await this._setContract({ creationCode: code, name: this.contractName.trim() || undefined }, 'dex.venues.contract.deploying');
  }

  async bindExisting() {
    const addr = this.contractCandidate.trim();
    if (!addr) return;
    const ok = await this.alertService.show(
      this.translate.instant('dex.venues.contract.bindTitle'),
      this.translate.instant('dex.venues.contract.bindConfirm', { address: addr }),
      this.translate.instant('dex.venues.contract.bindAction'),
    );
    if (!ok) return;
    await this._setContract({ venueContract: addr }, 'dex.venues.contract.binding');
  }

  async unbindContract() {
    // Since `Orders` was deleted, unbinding leaves the venue BOOKLESS rather than
    // reverting it to a platform-run book — the confirmation says so.
    const ok = await this.alertService.show(
      this.translate.instant('dex.venues.contract.unbindTitle'),
      this.translate.instant('dex.venues.contract.unbindConfirm'),
      this.translate.instant('dex.venues.contract.unbindAction'),
    );
    if (!ok) return;
    await this._setContract({ venueContract: null }, 'dex.venues.contract.unbinding');
  }

  templateName(kind: number | undefined | null): string {
    const t = this.venueTemplates().find(x => x.kind === Number(kind));
    return t?.label || (kind == null ? '—' : String(kind));
  }

  tierLabelShort(tier: number): string {
    if (tier !== 1 && tier !== 2 && tier !== 3) return '—';
    return this.tierLabel(tier);
  }
  goAsset(baseAsset: string) { this.router.navigate(['/authorized/dex/asset-listings/details/' + baseAsset]); }

  fmtPrice(v: string | number) { const n = Number(v ?? 0); return this.utils.formatPrice(Number.isFinite(n) ? n : 0); }
  fmtAmount(n: string) { return Number(n || '0').toLocaleString(); }

  getStatusClass(s: number | undefined): string {
    switch (Number(s)) {
      case 1: return 'bg-blue-100 text-blue-800';
      case 2: return 'bg-yellow-100 text-yellow-800';
      case 3: return 'bg-green-100 text-green-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  getSideClass(s: number | undefined): string {
    return Number(s) === 1 ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800';
  }

  shortRef(r: string): string {
    const s = String(r || '');
    return s.length > 18 ? s.slice(0, 8) + '…' + s.slice(-6) : s;
  }

  goOrder(ref: string) { this.router.navigate(['/authorized/dex/orders/details/' + ref]); }
  goTrade(id: number) { this.router.navigate(['/authorized/dex/trades/details/' + id]); }

  formatMs(ms: number): string {
    if (!ms) return '—';
    return this.utils.formatDate(Math.floor(ms / 1000));
  }

  stateName(s: number): string {
    switch (s) {
      case 1: return this.translate.instant('state.registered');
      case 2: return this.translate.instant('state.active');
      case 3: return this.translate.instant('state.paused');
      case 4: return this.translate.instant('state.deregistered');
      default: return String(s);
    }
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

  tierLabel(tier: 1 | 2 | 3): string {
    const scope = tier === 1 ? this.translate.instant('dex.venues.tier.scopeVenue')
      : tier === 2 ? this.translate.instant('dex.venues.tier.scopeCountry')
      : this.translate.instant('dex.venues.tier.scopeGlobal');
    return this.translate.instant('dex.venues.tier.withScope', { n: tier, scope });
  }
  tierStatus(tier: 1 | 2 | 3): { code: 'approved' | 'pending' | 'none'; label: string; cls: string } {
    const v = this.venue();
    if (!v) return { code: 'none', label: '—', cls: 'bg-gray-100 text-gray-800' };
    const approved = tier === 1 ? v.tier1Approved : tier === 2 ? v.tier2Approved : v.tier3Approved;
    const pending  = tier === 1 ? v.tier1Pending  : tier === 2 ? v.tier2Pending  : v.tier3Pending;
    if (approved) return { code: 'approved', label: this.translate.instant('state.approved'), cls: 'bg-green-100 text-green-800' };
    if (pending)  return { code: 'pending', label: this.translate.instant('dex.venues.tier.pendingApproval'), cls: 'bg-yellow-100 text-yellow-800' };
    return { code: 'none', label: this.translate.instant('dex.venues.tier.notRequested'), cls: 'bg-gray-100 text-gray-800' };
  }

  async requestTier(tier: 1 | 2 | 3) {
    const v = this.venue();
    if (!v) return;
    const ok = await this.alertService.show(
      this.translate.instant('dex.venues.tier.requestModal.title'),
      this.translate.instant('dex.venues.tier.requestModal.message', { tier: this.tierLabel(tier) }),
      this.translate.instant('dex.venues.tier.requestModal.confirm')
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('dex.venues.details.requestingTier'));
    try {
      const r = await this.apiService.vaultDexVenueRequestTier(v.serviceAddress, tier);
      if (r?.error) this.alertService.info(this.translate.instant('alerts.error'), r.error);
      await this.loadVenue();
    } finally { this.loadingService.hide(); }
  }

  // The DEX-vs-Exchange axis, replacing settlementModeName (2026-08-09). `allowP2P` is
  // derived on chain from whether the venue has a registered payment processor - i.e.
  // whether it holds client cash at all - so it cannot disagree with the configuration.
  venueSurfaceName(v: any): string {
    return v?.allowP2P === false
      ? this.translate.instant('dex.venues.surface.exchange')
      : this.translate.instant('dex.venues.surface.dex');
  }

  // ── Members (venue-operator side) ─────────────────────────────────────────
  /**
   * The venue CONSENTS to a membership request.
   *
   * INVERTED 2026-08-11: this tab used to carry an "Add Member" modal where the operator typed a
   * brokerage's address. The member now applies and the venue answers, so the tab is a QUEUE —
   * the same shape the asset-venue pairing already had. Reject is `removeMember`, which works
   * from any state (the venueRemoveAsset twin); there is no separate reject call.
   */
  async acceptMember(m: DexVenueMember) {
    const ok = await this.alertService.show(
      this.translate.instant('dex.members.acceptTitle'),
      this.translate.instant('dex.members.acceptConfirm', { member: m.memberName || m.memberService }),
      this.translate.instant('alerts.ok'),
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('dex.members.accepting'));
    try {
      const r = await this.apiService.vaultDexVenueMemberAccept(this.serviceAddress(), m.memberService);
      if (r?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), r.error);
      } else if (r?.requestId) {
        this.alertService.info(
          this.translate.instant('approvals.submittedTitle'),
          this.translate.instant('approvals.submittedMessage'),
          this.translate.instant('alerts.ok'),
        );
      } else {
        await this.loadMembers();
      }
    } finally { this.loadingService.hide(); }
  }

  async removeMember(m: DexVenueMember) {
    const ok = await this.alertService.show(
      this.translate.instant('dex.members.removeModal.title'),
      this.translate.instant('dex.members.removeModal.message', { name: m.memberName || m.memberService }),
      this.translate.instant('dex.members.removeModal.confirm'),
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('dex.members.removing'));
    try {
      const r = await this.apiService.vaultDexVenueMemberRemove(this.serviceAddress(), m.memberService);
      if (r?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), r.error);
      } else if (r?.requestId) {
        this.alertService.info(
          this.translate.instant('approvals.submittedTitle'),
          this.translate.instant('approvals.submittedMessage'),
          this.translate.instant('alerts.ok'),
        );
      } else {
        await this.loadMembers();
      }
    } finally { this.loadingService.hide(); }
  }

  // ─── Venue hosting: this venue's own leg on an asset pairing ────────────────
  //
  // Reuses getStateClass rather than inventing a palette: hostState IS the
  // platform's standard state ladder (1 Initiated / 2 Active / 3 Suspended), which
  // is also why it needs no Global Variables category of its own.
  hostStateClass(hostState: number | undefined): string {
    return this.getStateClass(hostState);
  }

  hostStateLabel(hostState: number | undefined): string {
    switch (Number(hostState ?? 1)) {
      case 2:  return 'state.active';
      case 3:  return 'state.suspended';
      default: return 'state.initiated';
    }
  }

  async acceptHostedAsset(a: any) {
    const ok = await this.alertService.show(
      this.translate.instant('dex.venues.details.acceptModal.title'),
      this.translate.instant('dex.venues.details.acceptModal.message', { asset: a.assetName || a.baseAsset }),
      this.translate.instant('common.accept'),
    );
    if (!ok) return;
    await this._runHostingAction(
      () => this.apiService.vaultDexVenueAssetAccept(this.serviceAddress(), a.baseAsset),
      'dex.venues.details.accepting',
    );
  }

  setHostedAssetHalted(a: any, halted: boolean) {
    this.haltReason = '';
    this.haltTarget.set({ baseAsset: a.baseAsset, assetName: a.assetName, halted });
    this.haltModalOpen.set(true);
  }

  async submitHalt() {
    const t = this.haltTarget();
    if (!t) return;
    this.haltModalOpen.set(false);
    await this._runHostingAction(
      () => this.apiService.vaultDexVenueAssetSetHalted(this.serviceAddress(), t.baseAsset, t.halted, (this.haltReason || '').trim()),
      t.halted ? 'dex.venues.details.halting' : 'dex.venues.details.resuming',
    );
  }

  async removeHostedAsset(a: any) {
    // From host state 1 this is a REJECT (the venue declining a request it never
    // accepted); from 2 or 3 it is an eviction. Same call either way — the pairing
    // is deleted — so only the wording changes.
    const pending = Number(a.hostState ?? 1) === 1;
    const ok = await this.alertService.show(
      this.translate.instant(pending ? 'dex.venues.details.rejectModal.title' : 'dex.venues.details.removeAssetModal.title'),
      this.translate.instant(pending ? 'dex.venues.details.rejectModal.message' : 'dex.venues.details.removeAssetModal.message',
        { asset: a.assetName || a.baseAsset }),
      this.translate.instant(pending ? 'common.reject' : 'common.remove'),
    );
    if (!ok) return;
    await this._runHostingAction(
      () => this.apiService.vaultDexVenueAssetRemove(this.serviceAddress(), a.baseAsset),
      'dex.venues.details.removingAsset',
    );
  }

  private async _runHostingAction(call: () => Promise<any>, loadingKey: string) {
    this.loadingService.show(this.translate.instant(loadingKey));
    try {
      const r = await call();
      if (r?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), r.error);
      } else if (r?.requestId) {
        this.alertService.info(
          this.translate.instant('approvals.submittedTitle'),
          this.translate.instant('approvals.submittedMessage'),
          this.translate.instant('alerts.ok'),
        );
      } else {
        await this.loadAssets();
      }
    } finally { this.loadingService.hide(); }
  }

  async openStateModal() {
    const v = this.venue();
    if (!v) return;
    if (v.state === 4) {
      this.alertService.info(this.translate.instant('dex.venues.details.notAllowedTitle'), this.translate.instant('dex.venues.details.terminalStateMessage'));
      return;
    }
    const result = await this.stateModal.show(v.state);
    if (!result) return;
    if (result.newState === 4) {
      const ok = await this.alertService.show(
        this.translate.instant('dex.venues.details.deactivateTitle'),
        this.translate.instant('dex.venues.details.deactivateMessage'),
        this.translate.instant('dex.venues.details.deactivateConfirm')
      );
      if (!ok) return;
    }
    this.loadingService.show(this.translate.instant('dex.venues.details.updatingState'));
    try {
      const r = await this.apiService.vaultDexVenueSetState(v.serviceAddress, result.newState);
      if (r?.error) this.alertService.info(this.translate.instant('alerts.error'), r.error);
      await this.loadVenue();
    } finally { this.loadingService.hide(); }
  }

  // ── Venue fees ────────────────────────────────────────────────────────────────────────
  //
  // This is the venue operator's ONLY reachable fee surface. The service detail page's
  // Assets tab is fed by a join on `asset_services` — the T20 distributor registration —
  // which is empty for a pure venue (mode 6), so its "Edit Venue Fees" button never
  // appeared for exactly the operators who host foreign assets and charge for it.

  feeLabel(a: any): string {
    const fc = a?.effective ?? a?.feeConfig ?? null;
    // Bps is a raw integer; Fixed is a MONEY amount and must render at the tenant's
    // configured precision, hence formatPrice rather than a bare interpolation.
    const side = (mode: number, value: string) => {
      if (!mode) return '—';
      return mode === 1 ? `${value} bps` : this.utils.formatPrice(Number(value));
    };
    if (!fc) return '—';
    const buy  = side(Number(fc.buyFeeMode),  fc.buyFeeValue);
    const sell = side(Number(fc.sellFeeMode), fc.sellFeeValue);
    if (buy === '—' && sell === '—') return '—';
    return `${buy} / ${sell}`;
  }

  // Three states, not two: an explicit ALL-NONE override means "this asset is free here" and
  // is NOT the same as inheriting a default that happens to be unset.
  feeSourceKey(a: any): string {
    if (a?.isSet) return 'dex.venues.details.assetsTable.feeOverride';
    if (a?.default) return 'dex.venues.details.assetsTable.feeInherited';
    return 'dex.venues.details.assetsTable.feeNone';
  }

  feeSourceClass(a: any): string {
    if (a?.isSet) return 'bg-blue-100 text-blue-800';
    if (a?.default) return 'bg-gray-100 text-gray-600';
    return 'bg-gray-50 text-gray-400';
  }

  async editAssetFee(a: any) {
    const v = this.venue();
    if (!v) return;
    const result = await this.feeConfigModal.show({
      service: v.serviceAddress,
      serviceName: v.serviceName || v.serviceAddress,
      mode: 'asset',
      asset: a.baseAsset,
      assetSymbol: a.assetSymbol || '',
      feeConfig: a.feeConfig ?? null,
      inherited: a.default ?? null,
      isSet: !!a.isSet,
    });
    if (!result) return;
    await this.submitFee(() =>
      this.apiService.vaultSetServiceFeeConfig(v.serviceAddress, a.baseAsset, result.feeConfig));
  }

  async editDefaultFee() {
    const v = this.venue();
    if (!v) return;
    const current = this.venueAssets().find((a: any) => a.default)?.default ?? null;
    const result = await this.feeConfigModal.show({
      service: v.serviceAddress,
      serviceName: v.serviceName || v.serviceAddress,
      mode: 'default',
      asset: '',
      assetSymbol: '',
      feeConfig: current,
    });
    if (!result) return;
    await this.submitFee(() =>
      this.apiService.vaultSetServiceDefaultFeeConfig(v.serviceAddress, result.feeConfig));
  }

  async resetAssetFee(a: any) {
    const v = this.venue();
    if (!v) return;
    const okConfirm = await this.alertService.show(
      this.translate.instant('dex.venues.details.assetsTable.resetFeeTitle'),
      this.translate.instant('dex.venues.details.assetsTable.resetFeeMessage', { asset: a.assetSymbol || a.baseAsset }),
      this.translate.instant('common.reset'),
    );
    if (!okConfirm) return;
    await this.submitFee(() =>
      this.apiService.vaultClearServiceFeeConfig(v.serviceAddress, a.baseAsset));
  }

  private async submitFee(call: () => Promise<any>) {
    this.loadingService.show(this.translate.instant('common.processing'));
    try {
      const res = await call();
      if (res?.requestId) {
        this.loadingService.hide();
        await this.alertService.info(
          this.translate.instant('approvals.submittedTitle'),
          this.translate.instant('approvals.submittedMessage'),
          this.translate.instant('alerts.ok'));
      }
      await this.loadAssets();
    } catch (e) {
      console.error('Fee update failed', e);
      this.loadingService.hide();
      await this.alertService.info(
        this.translate.instant('alerts.updateFailed'),
        this.translate.instant('dex.venues.details.assetsTable.feeError'));
    } finally {
      this.loadingService.hide();
    }
  }

}
