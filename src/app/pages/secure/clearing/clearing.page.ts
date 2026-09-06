import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../shared/components/header/header.component';
import { RefreshButtonComponent } from '../../../shared/components/refresh-button/refresh-button.component';
import { ApiService } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { FeaturesService } from '../../../shared/services/features.service';
import { UtilsService } from '../../../shared/services/utils.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import {
  ClearingDelivery, ClearingHold,
  ClearingMember, ClearingAccount, CreditSettlement, User,
} from '../../../shared/models/data.model';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { PaginatorComponent, pageSlice } from '../../../shared/components/paginator/paginator.component';

type Tab = 'account' | 'deliveries' | 'members' | 'memberships';

/**
 * Clearing — deferred DvP + central clearing.
 *
 * When a clearing house is attached to a venue, a cross-entity fill does NOT settle at match: the
 * cash obligation is NOVATED onto the CCP at trade date and both legs stay escrowed until the
 * netted cycle settles in fiat. Novation is what collapses N bilateral nets into ONE running
 * account per member per currency — the account tab is the point of the whole feature.
 *
 * ONE page with role-driven tabs, because a tenant can be BOTH sides: a brokerage is a member of
 * someone's clearing house, and a clearing house is itself an entity with its own memberships.
 * Which tabs render is decided by EVIDENCE (do we operate a CCP / are we a member), not by the
 * entity mode — the mode signal is private to FeaturesService and a hybrid would be mis-typed by it.
 */
@Component({
  selector: 'app-clearing',
  templateUrl: './clearing.page.html',
  styleUrls: ['./clearing.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, HeaderComponent, TranslatePipe, MoneyPipe,
    PaginatorComponent, RefreshButtonComponent,
  ],
})
export class ClearingPage implements OnInit {
  private apiService     = inject(ApiService);
  private authService    = inject(AuthService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);
  utils = inject(UtilsService);
  features = inject(FeaturesService);

  userInfo!: User;
  selfEntity = '';

  activeTab = signal<Tab>('deliveries');
  loaded = signal(false);
  refreshing = signal(false);

  deliveries = signal<ClearingDelivery[]>([]);
  members = signal<ClearingMember[]>([]);
  memberships = signal<ClearingMember[]>([]);

  /** 1-based, per frontend Standard 1.5. */
  deliveriesPage = signal(1);
  deliveriesPageSize = signal(25);
  deliveryStatusFilter = signal<number | ''>('');
  filteredDeliveries = computed(() => {
    const s = this.deliveryStatusFilter();
    return s === '' ? this.deliveries() : this.deliveries().filter(d => d.status === Number(s));
  });
  pagedDeliveries = computed(() => pageSlice(this.filteredDeliveries(), this.deliveriesPage(), this.deliveriesPageSize()));

  // ── Expanded rows ─────────────────────────────────────────────────────────
  // A delivery's custody holds and a cycle's snapshot positions are both small, per-row and only
  // interesting once you care about that row — so they expand in place rather than costing a
  // route. Both are fetched lazily and cached.
  expandedDelivery = signal<string | null>(null);
  deliveryHolds = signal<Record<string, ClearingHold[]>>({});

  // ── The running account ───────────────────────────────────────────────────
  accountHouse = signal('');
  accountCurrency = signal<number | ''>('');
  account = signal<ClearingAccount | null>(null);
  accountError = signal('');

  private currencySymbols = signal<Record<number, string>>({});
  private currencyNames = signal<Record<number, string>>({});
  currencyOptions = signal<{ code: number; label: string }[]>([]);

  /**
   * We operate a clearing house iff the API returned members for us — that read is scoped
   * server-side to houses this tenant runs (an `EXISTS` against its own `services`), so a
   * non-empty result IS the proof.
   *
   * ⚠️ The second leg (`|| cycles().length > 0`) went with the cycle family. It covered a
   * freshly created CCP with no members yet; that case now shows no operator tab until the
   * first member is admitted, which is also the first moment there is anything to operate on.
   */
  isOperator = computed(() => this.members().length > 0);
  isMember = computed(() => this.memberships().length > 0);

  visibleTabs = computed<Tab[]>(() => {
    const tabs: Tab[] = [];
    if (this.isMember()) tabs.push('account');
    tabs.push('deliveries');
    if (this.isOperator()) tabs.push('members');
    tabs.push('memberships');
    return tabs;
  });

  ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    // Awaited BEFORE selfEntity is read: on a reload entityInfo is empty until something fetches
    // it, and every row on this page turns on which side of a delivery we are.
    await this.authService.ensureEntityInfo();
    this.selfEntity = (this.authService.entityInfo?.address || '').toLowerCase();
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      await this.loadAll();
    } finally {
      this.loadingService.hide();
      this.loaded.set(true);
    }
  }

  /**
   * `clearing` is deliberately NOT in the API's PLUGIN_OWNED_SCOPES, so the plugin's per-block
   * notify does reach the browser — but a relayed write returns before the mirror has caught up,
   * so every tab also carries a manual Refresh (Standard 3.6).
   */
  async refresh() {
    this.refreshing.set(true);
    try {
      await this.loadAll();
    } finally {
      this.refreshing.set(false);
    }
  }

  private async loadAll() {
    await Promise.all([
      this.loadDeliveries(),
      this.loadMembers(),
      this.loadMemberships(),
      this.loadCurrencies(),
    ]);
    // Expanded caches can go stale under us; drop them rather than showing a mixed view.
    this.deliveryHolds.set({});
    await Promise.all([
      this.resolveEntityNames([
        ...this.members().map(m => m.entity),
        ...this.memberships().map(m => m.clearingHouse),
        ...this.deliveries().flatMap(d => [d.buyEntity, d.sellEntity]),
      ]),
    ]);
    // Land on a tab this tenant actually has. Doing it after the loads is what makes it correct —
    // the tab set is derived from the data, so deciding earlier would always pick the fallback.
    if (!this.visibleTabs().includes(this.activeTab())) {
      this.activeTab.set(this.visibleTabs()[0]);
    }
    if (!this.accountHouse() && this.memberships().length) {
      this.accountHouse.set(this.memberships()[0].clearingHouse);
    }
  }

  private async loadDeliveries() {
    this.deliveries.set(await this.apiService.vaultClearingDeliveries({ start: 0, offset: 200 }));
  }

  private async loadMembers() {
    this.members.set(await this.apiService.vaultClearingMembers());
  }

  private async loadMemberships() {
    this.memberships.set(await this.apiService.vaultClearingMemberships());
  }

  private async loadCurrencies() {
    const data = await this.apiService.vaultGetApprovedCurrencies();
    const names: Record<number, string> = {};
    const symbols: Record<number, string> = {};
    const options: { code: number; label: string }[] = [];
    for (const c of (data?.currencies ?? [])) {
      const code = Number(c.code);
      names[code] = c.name || c.symbol || '';
      symbols[code] = c.symbol || '';
      options.push({ code, label: c.symbol || c.name || String(code) });
    }
    this.currencyNames.set(names);
    this.currencySymbols.set(symbols);
    this.currencyOptions.set(options.sort((a, b) => a.label.localeCompare(b.label)));
    if (this.accountCurrency() === '' && options.length) this.accountCurrency.set(options[0].code);
  }

  // ── Expand / collapse ─────────────────────────────────────────────────────

  async toggleDelivery(d: ClearingDelivery) {
    if (this.expandedDelivery() === d.deliveryKey) { this.expandedDelivery.set(null); return; }
    this.expandedDelivery.set(d.deliveryKey);
    if (this.deliveryHolds()[d.deliveryKey]) return;
    const data = await this.apiService.vaultClearingDelivery(d.deliveryKey);
    this.deliveryHolds.set({ ...this.deliveryHolds(), [d.deliveryKey]: data?.holds ?? [] });
  }

  holdsFor(key: string): ClearingHold[] { return this.deliveryHolds()[key] ?? []; }

  // ── The running account ───────────────────────────────────────────────────

  async loadAccount() {
    const house = this.accountHouse();
    const code = this.accountCurrency();
    this.account.set(null);
    this.accountError.set('');
    if (!house || code === '') return;
    const acct = await this.apiService.vaultClearingAccount(house, Number(code));
    if (!acct) { this.accountError.set(this.translate.instant('clearing.account.unavailable')); return; }
    this.account.set(acct);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  canAct(): boolean { return !!this.userInfo && this.userInfo.role !== 3; }

  /** Delegates to the shared `AlertService.info` — one button, no Cancel. */
  private info(title: string, message: string) {
    return this.alertService.info(title, message, this.translate.instant('alerts.ok'), 'max-w-md');
  }

  private confirm(title: string, message: string) {
    return this.alertService.show(title, message, this.translate.instant('alerts.ok'));
  }

  private async run(fn: () => Promise<any>) {
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      const res = await fn();
      if (res?.error) {
        await this.info(this.translate.instant('alerts.error'), res.error);
        return;
      }
      // A relayed write can come back as a queued maker/checker request instead of a tx.
      if (res?.requestId) {
        await this.info(
          this.translate.instant('approvals.submittedTitle'),
          this.translate.instant('approvals.submittedMessage'));
      }
      await this.loadAll();
    } catch (e: any) {
      await this.info(this.translate.instant('alerts.error'), e?.message || String(e));
    } finally {
      this.loadingService.hide();
    }
  }

  /** The member's OWN act — a third party may not agree to face a CCP on your behalf. */
  async acceptMembership(m: ClearingMember) {
    const ok = await this.confirm(
      this.translate.instant('clearing.memberships.acceptTitle'),
      this.translate.instant('clearing.memberships.acceptConfirm'));
    if (!ok) return;
    await this.run(() => this.apiService.vaultClearingMemberAccept(m.clearingHouse));
  }

  // ⚠️ THE CYCLES AND PAY-INS TABS ARE GONE, along with every cycle read.
  //
  // Netting is CONTINUOUS now — a member's demand is its live margin requirement,
  // read from the same obligation ledger the delivery gate reads, not a periodic
  // snapshot. The five Cycle* events behind the mirror are emitted by nothing: the
  // cycle entrypoints went with the margin re-base and only their DECLARATIONS
  // survived, so both sync plugins bound valid topic0s that matched forever
  // nothing and the board rendered an empty table that read as "all settled".

  async executeDelivery(d: ClearingDelivery) {
    await this.run(() => this.apiService.vaultClearingDeliveryExecute(d.deliveryKey));
  }

  /** action 3 = fail. Permissionless AFTER the deadline; the button only shows once it has passed. */
  async failDelivery(d: ClearingDelivery) {
    const ok = await this.confirm(
      this.translate.instant('clearing.deliveries.failTitle'),
      this.translate.instant('clearing.deliveries.failConfirm'));
    if (!ok) return;
    await this.run(() => this.apiService.vaultClearingDeliveryAct(3, d.deliveryKey));
  }

  // ── Row predicates ────────────────────────────────────────────────────────

  /** Ready, and nothing is holding it. A hold blocks DELIVERY only — never the unwind. */
  canDeliver(d: ClearingDelivery): boolean {
    return this.canAct() && d.status === 2 && d.holdCount === 0;
  }

  /** Past its deadline and not yet resolved — the escrow-recovery path. */
  canFail(d: ClearingDelivery): boolean {
    return this.canAct() && (d.status === 1 || d.status === 2) && d.deadline > 0 && Date.now() > d.deadline;
  }


  /** A membership we have been admitted to but not yet accepted. */
  needsAccept(m: ClearingMember): boolean { return this.canAct() && m.state === 1; }

  isSelf(addr: string): boolean { return (addr || '').toLowerCase() === this.selfEntity; }

  /** Which side of a delivery we are — a brokerage sees its client's trade from one side only. */
  sideOf(d: ClearingDelivery): string {
    if (this.isSelf(d.buyEntity)) return this.translate.instant('clearing.deliveries.sideBuy');
    if (this.isSelf(d.sellEntity)) return this.translate.instant('clearing.deliveries.sideSell');
    return this.translate.instant('clearing.deliveries.sideVenue');
  }

  // ── Labels ────────────────────────────────────────────────────────────────

  /** The alpha code in a `.badge-currency` pill, matching every other money column in the app. */
  currencyLabel(code: number): string {
    const c = Number(code);
    return this.currencySymbols()[c] || this.currencyNames()[c] || String(code);
  }

  private entityNames = signal<Record<string, string>>({});

  entityName(addr: string): string {
    return this.entityNames()[String(addr || '').toLowerCase()] || '';
  }

  entityLabel(addr: string): string { return this.entityName(addr) || addr || ''; }

  /**
   * A clearing member is by construction a FOREIGN entity, so the local mirror holds no name for
   * it and every column here would render a bare 0x address. The Directory is chain-backed, so it
   * answers for any party; an unresolvable address keeps rendering as the address.
   */
  private async resolveEntityNames(addresses: string[]) {
    const known = this.entityNames();
    const missing = [...new Set(
      addresses.map(a => String(a || '').toLowerCase()).filter(a => a && !(a in known)),
    )];
    if (!missing.length) return;
    const next = { ...known };
    await Promise.all(missing.map(async (a) => {
      try {
        const r = await this.apiService.directoryByAddress(a);
        if (r?.entry?.name) next[a] = r.entry.name;
      } catch { /* not in the directory — the address stays the label */ }
    }));
    this.entityNames.set(next);
  }

  shortKey(key: string): string {
    const k = String(key || '');
    return k.length > 14 ? k.slice(0, 8) + '…' + k.slice(-4) : k;
  }

  deliveryStatusName(s: number): string {
    switch (Number(s)) {
      case 1: return this.translate.instant('clearing.deliveryStates.pending');
      case 2: return this.translate.instant('clearing.deliveryStates.ready');
      case 3: return this.translate.instant('clearing.deliveryStates.delivered');
      case 4: return this.translate.instant('clearing.deliveryStates.failed');
      default: return String(s);
    }
  }

  deliveryStatusClass(s: number): string {
    switch (Number(s)) {
      case 1: return 'bg-amber-100 text-amber-800';
      case 2: return 'bg-blue-100 text-blue-800';
      case 3: return 'bg-green-100 text-green-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  memberStateName(s: number): string {
    switch (Number(s)) {
      case 1: return this.translate.instant('clearing.memberStates.initiated');
      case 2: return this.translate.instant('clearing.memberStates.active');
      case 3: return this.translate.instant('clearing.memberStates.suspended');
      case 4: return this.translate.instant('clearing.memberStates.removed');
      default: return String(s);
    }
  }

  memberStateClass(s: number): string {
    switch (Number(s)) {
      case 1: return 'bg-amber-100 text-amber-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-red-100 text-red-800';
      case 4: return 'bg-gray-200 text-gray-600';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  /** 1 BookTrade / 2 OfferingFill — decides whether `seller` is a subscription or a service. */
  deliveryKindName(k: number): string {
    return Number(k) === 2
      ? this.translate.instant('clearing.deliveryKinds.offeringFill')
      : this.translate.instant('clearing.deliveryKinds.bookTrade');
  }
}
