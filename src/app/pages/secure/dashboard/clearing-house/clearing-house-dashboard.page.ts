import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription as RxSubscription } from 'rxjs';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { SocketService } from '../../../../shared/services/socket.service';
import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import {
  ClearingCycle, ClearingDelivery, ClearingMember, ClearingPosition, CreditSettlement, User,
} from '../../../../shared/models/data.model';

/** One pay-in row: the member's snapshot position plus the cycle it belongs to. */
interface PayInRow { cycle: ClearingCycle; position: ClearingPosition; }
interface OpStat { title: string; value: number; path: string; alert?: boolean; }

/**
 * Clearing House home (entity mode 7).
 *
 * A CCP operates on cycles, pay-ins, deliveries and members — none of which the
 * service-provider home shows. The question this page has to answer on sight is the one
 * `cycleConfirmPayIn` turns on: WHICH MEMBERS OWE ME FIAT ON A CLOSED CYCLE, AND HAVE THEY
 * ACTUALLY WIRED IT?
 *
 * ⚠ The pay-in board filters `net < 0` server-side, NOT `paidIn === false`. `closeCycle`
 * PRE-SATISFIES every member whose net is >= 0, so a `paidIn` filter looks right and quietly
 * renders an empty board on a perfectly ordinary cycle. Do not re-filter here.
 *
 * ⚠ The settlement shown against a pay-in is evidence on the PAIR, not "this cycle's
 * settlement" — a position is a multilateral snapshot, a settlement discharges the bilateral
 * running net. The amounts are not expected to match; never show a delta.
 *
 * Read-only by construction: every action (confirm pay-in, close, finalize, deliver) lives on
 * the Clearing page, so this page links there rather than duplicating gated write buttons.
 */
@Component({
  selector: 'app-clearing-house-dashboard',
  templateUrl: './clearing-house-dashboard.page.html',
  styleUrls: ['./clearing-house-dashboard.page.scss'],
  standalone: true,
  imports: [CommonModule, HeaderComponent, TranslatePipe, MoneyPipe],
})
export class ClearingHouseDashboardPage implements OnInit {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private loadingService = inject(LoadingService);
  private router = inject(Router);
  socketService = inject(SocketService);
  features = inject(FeaturesService);
  utils = inject(UtilsService);

  userInfo!: User;

  get entityActive() { return this.authService.entityActive(); }
  get entityStateName() { return this.authService.entityInfo?.stateName ?? ''; }

  userCount = signal<number | null>(null);
  showBootstrapNudge = computed(() => this.userCount() === 1 && Number(this.userInfo?.role) === 1);

  loading = signal(true);
  lastUpdated = signal<Date | null>(null);

  cycles = signal<ClearingCycle[]>([]);
  deliveries = signal<ClearingDelivery[]>([]);
  members = signal<ClearingMember[]>([]);
  payIns = signal<PayInRow[]>([]);

  opsApprovals = signal<number | null>(null);
  opsUnread = signal(0);

  private currencySymbols = signal<Record<number, string>>({});
  private entityNames = signal<Record<string, string>>({});

  /**
   * The whole page hangs off the Clearing module. When an admin has it switched off we show the
   * nudge and render NOTHING from it — a dashboard that ignored the toggle would be a backdoor
   * around the admin's own visibility control.
   */
  clearingVisible = computed(() => this.features.menuEnabled('clearing'));

  // ── Cycle aggregates ──────────────────────────────────────────────────────
  openCycles      = computed(() => this.cycles().filter(c => c.status === 1).length);
  closedCycles    = computed(() => this.cycles().filter(c => c.status === 2).length);
  finalizedCycles = computed(() => this.cycles().filter(c => c.status === 3).length);

  // ── Pay-in aggregates ─────────────────────────────────────────────────────
  outstandingPayIns = computed(() => this.payIns().filter(r => !r.position.paidIn).length);
  /** Owed but with nothing in the credit ledger to show for it — the rows worth looking at first. */
  unevidencedPayIns = computed(() =>
    this.payIns().filter(r => !r.position.paidIn && !this.hasSentSettlement(r.position)).length);

  // ── Delivery aggregates ───────────────────────────────────────────────────
  // 1 Pending / 2 Ready / 3 Delivered / 4 Failed. Held blocks DELIVERY only, never the unwind.
  pendingDeliveries = computed(() => this.deliveries().filter(d => d.status === 1).length);
  readyDeliveries   = computed(() => this.deliveries().filter(d => d.status === 2).length);
  heldDeliveries    = computed(() => this.deliveries().filter(d => d.holdCount > 0 && (d.status === 1 || d.status === 2)).length);
  overdueDeliveries = computed(() => {
    const now = Date.now();
    return this.deliveries().filter(d => (d.status === 1 || d.status === 2) && d.deadline > 0 && now > d.deadline).length;
  });

  // ── Member aggregates ─────────────────────────────────────────────────────
  activeMembers    = computed(() => this.members().filter(m => m.state === 2).length);
  pendingMembers   = computed(() => this.members().filter(m => m.state === 1).length);
  suspendedMembers = computed(() => this.members().filter(m => m.state === 3).length);

  /**
   * Unpaid first, then largest demand — the operator's actual reading order, matching the
   * Clearing page's own board so the two never contradict each other.
   */
  topPayIns = computed(() => [...this.payIns()]
    .sort((a, b) => Number(a.position.paidIn) - Number(b.position.paidIn) || a.position.net - b.position.net)
    .slice(0, 8));

  /** Cycles the operator can act on: Open (closeable) and Closed (finalizable). */
  actionableCycles = computed(() => this.cycles()
    .filter(c => c.status === 1 || c.status === 2)
    .sort((a, b) => a.status - b.status || a.closesAt - b.closesAt)
    .slice(0, 6));

  opStats = computed<OpStat[]>(() => {
    const out: OpStat[] = [];
    if (this.clearingVisible()) {
      out.push({ title: 'clearing.dashboard.stats.awaitingPayIn', value: this.outstandingPayIns(), path: '/authorized/clearing', alert: this.outstandingPayIns() > 0 });
      out.push({ title: 'clearing.dashboard.stats.deliveriesReady', value: this.readyDeliveries(), path: '/authorized/clearing' });
      out.push({ title: 'clearing.dashboard.stats.deliveriesHeld', value: this.heldDeliveries(), path: '/authorized/clearing', alert: this.heldDeliveries() > 0 });
      out.push({ title: 'clearing.dashboard.stats.pastDeadline', value: this.overdueDeliveries(), path: '/authorized/clearing', alert: this.overdueDeliveries() > 0 });
      out.push({ title: 'clearing.dashboard.stats.pendingMembers', value: this.pendingMembers(), path: '/authorized/clearing', alert: this.pendingMembers() > 0 });
    }
    if (Number(this.userInfo?.role) === 2) {
      out.push({ title: 'clearing.dashboard.stats.pendingApprovals', value: this.opsApprovals() ?? 0, path: '/authorized/approvals/list' });
    }
    out.push({ title: 'clearing.dashboard.stats.unreadMessages', value: this.opsUnread(), path: '/authorized/messages/list' });
    return out;
  });

  private _socketSub: RxSubscription | null = null;

  constructor() {}

  async ngOnInit() {}

  async ionViewWillEnter() {
    await this.loadPageData(false);
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.loadPageData(true));
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  goTo(path: string) { this.router.navigate([path]); }

  // ── Settlement evidence ───────────────────────────────────────────────────

  /** Newest first from the API, so the head is the latest activity on the pair. */
  latestSettlement(p: ClearingPosition): CreditSettlement | null {
    return p.settlements?.[0] ?? null;
  }

  /** 2 Sent Confirmed / 3 Settled — the member has actually asserted a wire. */
  hasSentSettlement(p: ClearingPosition): boolean {
    return (p.settlements ?? []).some(s => s.state === 2 || s.state === 3);
  }

  settlementLabelKey(s: CreditSettlement | null): string {
    if (!s) return 'clearing.payIns.settlementNone';
    switch (Number(s.state)) {
      case 1: return 'settlements.states.pending';
      case 2: return 'settlements.states.sentConfirmed';
      case 3: return 'settlements.states.settled';
      default: return 'clearing.payIns.settlementNone';
    }
  }

  settlementClass(s: CreditSettlement | null): string {
    switch (Number(s?.state)) {
      case 1: return 'bg-amber-100 text-amber-800';
      case 2: return 'bg-blue-100 text-blue-800';
      case 3: return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  // ── Labels ────────────────────────────────────────────────────────────────

  currencyLabel(code: number): string {
    return this.currencySymbols()[Number(code)] || String(code);
  }

  entityLabel(addr: string): string {
    const a = String(addr || '').toLowerCase();
    return this.entityNames()[a] || this.utils.shortAddr(addr);
  }

  shortKey(key: string): string {
    const k = String(key || '');
    return k.length > 14 ? k.slice(0, 8) + '…' + k.slice(-4) : k;
  }

  cycleStatusKey(s: number): string {
    switch (Number(s)) {
      case 1: return 'clearing.cycleStates.open';
      case 2: return 'clearing.cycleStates.closed';
      case 3: return 'clearing.cycleStates.finalized';
      case 4: return 'clearing.cycleStates.abandoned';
      default: return 'clearing.cycleStates.open';
    }
  }

  cycleStatusClass(s: number): string {
    switch (Number(s)) {
      case 1: return 'bg-blue-100 text-blue-800';
      case 2: return 'bg-amber-100 text-amber-800';
      case 3: return 'bg-green-100 text-green-800';
      case 4: return 'bg-gray-200 text-gray-600';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  /** `closes_at` on this mirror is MILLISECONDS — formatTime, never formatDate. */
  cycleCloses(c: ClearingCycle): string { return this.utils.formatTime(c.closesAt); }

  // ── Load ──────────────────────────────────────────────────────────────────

  private async loadPageData(silent = false) {
    await this.authService.ready();
    this.userInfo = this.authService.userInfo;
    if (!this.userInfo) { this.router.navigate(['/public/user/login']); return; }

    this.authService.refreshEntityState();

    if (Number(this.userInfo.role) === 1) {
      await this.getUserCount();
    } else {
      if (!silent) this.loading.set(true);
      await Promise.all([this.loadClearing(), this.loadOps()]);
      this.lastUpdated.set(new Date());
      this.loading.set(false);
    }
    if (!silent) this.loadingService.hide();
  }

  private async getUserCount() {
    const res = await this.apiService.vaultGetUsers(0, 2);
    if (res) this.userCount.set(res.count);
  }

  private async loadClearing() {
    if (!this.clearingVisible()) {
      this.cycles.set([]); this.deliveries.set([]); this.members.set([]); this.payIns.set([]);
      return;
    }
    const [cycles, deliveries, members] = await Promise.all([
      this.apiService.vaultClearingCycles({ start: 0, offset: 200 }).catch(() => []),
      this.apiService.vaultClearingDeliveries({ start: 0, offset: 200 }).catch(() => []),
      this.apiService.vaultClearingMembers().catch(() => []),
      this.loadCurrencies(),
    ]);
    this.cycles.set(cycles ?? []);
    this.deliveries.set(deliveries ?? []);
    this.members.set(members ?? []);
    await this.loadPayIns();
  }

  /**
   * Fans out over CLOSED cycles only (status 2). Finalized (3) is done by definition and an
   * Open (1) cycle has no positions yet — they are snapshotted at close.
   */
  private async loadPayIns() {
    const closed = this.cycles().filter(c => c.status === 2);
    if (!closed.length) { this.payIns.set([]); return; }
    const board: PayInRow[] = [];
    await Promise.all(closed.map(async (cycle) => {
      const rows = await this.apiService.vaultClearingCyclePayIns(cycle.cycleKey).catch(() => []);
      for (const position of (rows ?? [])) board.push({ cycle, position });
    }));
    this.payIns.set(board);
    await this.resolveEntityNames(board.map(b => b.position.entity));
  }

  private async loadCurrencies() {
    const data = await this.apiService.vaultGetApprovedCurrencies().catch(() => null);
    const symbols: Record<number, string> = {};
    for (const c of (data?.currencies ?? [])) symbols[Number(c.code)] = c.symbol || c.name || '';
    this.currencySymbols.set(symbols);
  }

  /**
   * A clearing member is by construction a FOREIGN entity, so the local mirror holds no name
   * for it. The Directory is chain-backed and answers for any party; unresolvable addresses
   * fall back to a shortened address rather than a blank cell.
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
      } catch { /* not in the directory — the short address stays the label */ }
    }));
    this.entityNames.set(next);
  }

  private async loadOps() {
    const role = Number(this.userInfo?.role);
    const [appr, threads] = await Promise.all([
      role === 2 ? this.apiService.vaultApprovalsList({ state: 1, offset: 1 }).catch(() => null) : Promise.resolve(null),
      this.apiService.connectThreadsList(1, 100).catch(() => null),
    ]);
    this.opsApprovals.set(appr ? Number((appr as any).count ?? 0) : null);
    const threadList = (threads as any)?.threads ?? [];
    this.opsUnread.set(threadList.reduce((sum: number, t: any) => sum + (Number(t.unreadCount) || 0), 0));
  }
}
