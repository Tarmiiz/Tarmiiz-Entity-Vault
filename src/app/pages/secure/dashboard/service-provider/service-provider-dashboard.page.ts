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
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { Service, User } from '../../../../shared/models/data.model';
import { partyClassName } from '../../../../shared/constants/party-class';

// Sub-type names for the tenant's services. They come from the ONE shared *_CLASS_NAME map per
// catalog so the chip and the table row below (which read the server's `party_class_name` /
// `market_class_name`) can never disagree.
//
// ⚠️ TWO CATALOGS, NOT ONE. A type-2 service's sub-type is a `Party Class`; a type-1 service's
// is a `Market Class`. Both number from 1, so resolving the wrong one is a valid-looking wrong
// answer — class 2 is "Payment Gateway" in one and "Exchange" in the other, and nothing errors.
// Always branch on `serviceType` first.
//
// ⚠️ The local map this replaced was stale in BOTH directions: its ids were the pre-split
// numbering (3=Custodian, 4=Clearing House — 3 is now Bank), and 5/6 were named
// "Consultant"/"Appraiser", a vocabulary that no longer exists in the catalog at all. So a
// custodian's chip read "Clearing House" while the row beside it read "Custodian".

interface ServiceClassCount { serviceType: number; classId: number; name: string; count: number; }
interface OpStat { title: string; value: number; path: string; }

@Component({
  selector: 'app-service-provider-dashboard',
  templateUrl: './service-provider-dashboard.page.html',
  styleUrls: ['./service-provider-dashboard.page.scss'],
  standalone: true,
  imports: [CommonModule, HeaderComponent, TranslatePipe],
})
export class ServiceProviderDashboardPage implements OnInit {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private loadingService = inject(LoadingService);
  private router = inject(Router);
  socketService = inject(SocketService);
  // The "awaiting licences" state (Phase 28.13): with Entity Mode retired, a fresh entity's surface
  // is exactly what its regulator has issued — nothing yet — so the home page says why and what next.
  features = inject(FeaturesService);

  userInfo!: User;

  get entityActive() { return this.authService.entityActive(); }
  get entityStateName() { return this.authService.entityInfo?.stateName ?? ''; }

  userCount = signal<number | null>(null);
  showBootstrapNudge = computed(() => this.userCount() === 1 && Number(this.userInfo?.role) === 1);

  loading = signal(true);
  lastUpdated = signal<Date | null>(null);

  services = signal<Service[]>([]);

  opsApprovals = signal<number | null>(null);
  opsDocuments = signal(0);
  opsUnread = signal(0);

  // ── Portfolio aggregates ─────────────────────────────────────────────────
  totalServices     = computed(() => this.services().length);
  activeServices    = computed(() => this.services().filter(s => Number(s.state) === 2 && !s.suspended).length);
  suspendedServices = computed(() => this.services().filter(s => s.suspended || Number(s.state) === 3).length);
  inactiveServices  = computed(() => this.services().filter(s => Number(s.state) === 4 || Number(s.state) === 0 || Number(s.state) === 1).length);

  // ── Grouped by LICENSE CLASS (Phase 28 step (e), 2026-09-03) ──────────────────────────────
  //
  // The retired version keyed on `(serviceType, classId)` because the two sub-type catalogs both
  // started at 1, so collapsing them merged a Payment Gateway (party class 2) with an Exchange
  // (market class 2). License classes are 27/28/29 in ONE namespace, so the compound key is no
  // longer needed — but note the hazard did not vanish, it moved: 1/2/3 are still live PARTY
  // classes, so anything that mixes the two vocabularies has the same collision.
  //
  // ⚠️ A SERVICE CAN NOW APPEAR IN SEVERAL BUCKETS. It holds a SET, so one holding both a Token
  // Issuer and an Exchange license is counted under each — the counts are per LICENSE, not per
  // service, and they deliberately do not sum to `totalServices`.
  //
  // 🔴 EMPTY UNTIL THE LICENSE READ ROUTE LANDS (licensing lane) — `Service.licenses` is
  // populated by nothing yet, so this renders no chips rather than wrong ones.
  serviceClassCounts = computed<ServiceClassCount[]>(() => {
    const counts = new Map<number, ServiceClassCount>();
    for (const s of this.services()) {
      for (const classId of (s.licenses ?? [])) {
        const existing = counts.get(classId);
        if (existing) { existing.count++; continue; }
        counts.set(classId, { serviceType: 0, classId, name: this.classNameFor(0, classId), count: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => a.classId - b.classId);
  });

  opStats = computed<OpStat[]>(() => {
    const out: OpStat[] = [];
    if (Number(this.userInfo?.role) === 2) {
      out.push({ title: 'Pending Approvals', value: this.opsApprovals() ?? 0, path: '/authorized/approvals/list' });
    }
    out.push({ title: 'Documents',       value: this.opsDocuments(), path: '/authorized/documents/list' });
    out.push({ title: 'Unread Messages', value: this.opsUnread(),    path: '/authorized/messages/list' });
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
  viewService(s: Service) { this.router.navigate(['/authorized/services/details/' + s.address]); }

  getStateClass(state: number): string {
    switch (Number(state)) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  // ⚠️ ONE VOCABULARY NOW (Phase 28 step (e)) — license classes, so the `serviceType` argument
  // that used to pick between two catalogs is inert and kept only so callers need no edit.
  //
  // ⚠️ The two-catalog hazard has NOT gone away, it has moved: license classes are 27/28/29 while
  // 1/2/3 remain live PARTY classes, so anything resolving a bare small integer against the wrong
  // one still renders a confident wrong name. That is why the fallback is `Class N` rather than a
  // guess from `partyClassName`.
  private static readonly LICENSE_NAMES: Record<number, string> =
    { 27: 'Token Issuer', 28: 'Exchange', 29: 'Brokerage' };
  private classNameFor(_serviceType: number, classId: number): string {
    if (!classId) return '';
    return ServiceProviderDashboardPage.LICENSE_NAMES[classId] ?? `Class ${classId}`;
  }

  // The server's label first (it joins the live Global Variables catalog, so a value added on
  // chain shows up with no rebuild); the local map only backfills when the join found nothing.
  serviceClassLabel(s: Service): string {
    const ids = s.licenses ?? [];
    if (!ids.length) return '—';
    return ids.map((i) => this.classNameFor(0, i)).join(', ');
  }

  // ⚠️ `showMarketClassPill` REMOVED (Phase 28 step (e)) — a license carries no separate
  // confirmation to display. It is Active BECAUSE a regulator approved it, so "awaiting
  // confirmation" is not a state the ledger can be in. Deleted rather than left returning
  // `false`: a predicate that is always false is a branch nobody can reach and everybody
  // re-reads.

  private readonly stateNames: Record<number, string> = {
    0: 'Inactive', 1: 'Initiated', 2: 'Active', 3: 'Suspended', 4: 'Deactivated',
  };

  private mapVaultService(raw: any): Service {
    const meta = typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {};
    return {
      address: raw.address,
      entity: raw.entity ?? '',
      entityName: raw.entity_name ?? raw.entity ?? '',
      name: raw.name,
      metadata: typeof raw.metadata === 'object' ? JSON.stringify(raw.metadata ?? {}) : (raw.metadata ?? ''),
      description: meta.description ?? '',
      email: meta.email ?? '',
      mobile: meta.mobile ?? '',
      website: meta.website ?? '',
      contact: (meta.contact && typeof meta.contact === 'object') ? {
        email:   meta.contact.email   ?? '',
        phone:   meta.contact.phone   ?? '',
        website: meta.contact.website ?? '',
        address: meta.contact.address ?? '',
      } : {
        email:   meta.email ?? '',
        phone:   meta.telephone ?? meta.mobile ?? '',
        website: meta.website ?? '',
        address: meta.address ?? '',
      },
      countryCode: raw.country_code ?? 0,
      countryName: raw.country_name ?? '',
      verificationLevel: raw.verification_level ?? 0,
      verificationLevelName: raw.verification_level_name ?? String(raw.verification_level ?? ''),
      // ⚠️ Phase 28 step (e): service_type / service_type_name / party_class(_name) /
      // market_class(_name) / market_class_confirmed are GONE from `services_view`. The
      // license SET replaces them and is EMPTY until the licensing lane's read route lands —
      // deliberately not defaulted to anything that would render as a type.
      licenses: raw.licenses ?? [],
      regulator: raw.regulator ?? '',
      regulatorName: raw.regulator_name ?? '',
      regulatorSymbol: '',
      validator: raw.validator ?? '',
      paymentProcessor: raw.payment_processor ?? '',
      suspended: raw.suspended === true || raw.suspended === 1,
      state: raw.state ?? 0,
      stateName: raw.state_name ?? this.stateNames[raw.state] ?? String(raw.state ?? ''),
    } as Service;
  }

  private async loadPageData(silent = false) {
    await this.authService.ready();
    this.userInfo = this.authService.userInfo;
    if (!this.userInfo) { this.router.navigate(['/public/user/login']); return; }

    this.authService.refreshEntityState();

    if (Number(this.userInfo.role) === 1) {
      await this.getUserCount();
    } else {
      if (!silent) this.loading.set(true);
      await Promise.all([this.loadServices(), this.loadOps()]);
      this.lastUpdated.set(new Date());
      this.loading.set(false);
    }
    if (!silent) this.loadingService.hide();
  }

  private async getUserCount() {
    const res = await this.apiService.vaultGetUsers(0, 2);
    if (res) this.userCount.set(res.count);
  }

  private async loadServices() {
    const res = await this.apiService.vaultGetServicesOwn(0, 500);
    const list = (res?.services ?? [])
      .map((s: any) => this.mapVaultService(s))
      // ⚠️ The `serviceType === 2` filter is DROPPED (Phase 28 step (e)). This is the SERVICE
      // PROVIDER dashboard and the old test meant "not a token provider" — a distinction the
      // Service struct no longer draws. It is NOT translatable to a license test: the three
      // license classes are the MARKET family, i.e. the type-1 half, so "holds none of them"
      // would silently include a brand-new issuer whose license is still Requested.
      // Every own service is listed; the class column says what each one holds.
      ;
    this.services.set(list);
  }

  private async loadOps() {
    const role = Number(this.userInfo?.role);
    const [appr, docs, threads] = await Promise.all([
      role === 2 ? this.apiService.vaultApprovalsList({ state: 1, offset: 1 }).catch(() => null) : Promise.resolve(null),
      this.apiService.documentsList(1, 1).catch(() => null),
      this.apiService.connectThreadsList(1, 100).catch(() => null),
    ]);
    this.opsApprovals.set(appr ? Number((appr as any).count ?? 0) : null);
    this.opsDocuments.set(Number((docs as any)?.count ?? 0));
    const threadList = (threads as any)?.threads ?? [];
    this.opsUnread.set(threadList.reduce((sum: number, t: any) => sum + (Number(t.unreadCount) || 0), 0));
  }
}
