import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription as RxSubscription } from 'rxjs';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { SocketService } from '../../../../shared/services/socket.service';
import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { Service, User } from '../../../../shared/models/data.model';

// Provider sub-types for type-2 (service-provider) services — the REGULATOR party numbering
// (`Regulator Party Type` in Global Variables). Keep in step with it: a missing id falls back to
// 'Other' in the Provider Types chips while the table row below still reads the correct name from
// the server's `provider_type_name`, so the two disagree silently rather than erroring.
const PROVIDER_TYPE_NAMES: Record<number, string> = {
  1: 'Validator', 2: 'Payment Processor', 3: 'Custodian', 4: 'Clearing House',
  // 5/6 are catalog-only — no service can declare them today, but naming them keeps the chip
  // readable if one is ever given a registration path.
  5: 'Consultant', 6: 'Appraiser',
};

interface ProviderTypeCount { type: number; name: string; count: number; }
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

  providerTypeCounts = computed<ProviderTypeCount[]>(() => {
    const counts = new Map<number, number>();
    for (const s of this.services()) {
      const t = Number(s.providerType) || 0;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([type, count]) => ({ type, name: PROVIDER_TYPE_NAMES[type] ?? 'Other', count }))
      .sort((a, b) => a.type - b.type);
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

  providerTypeName(s: Service): string {
    return s.providerTypeName || PROVIDER_TYPE_NAMES[Number(s.providerType)] || '—';
  }

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
      serviceType: raw.service_type ?? 0,
      serviceTypeName: raw.service_type_name ?? '',
      providerType: raw.provider_type ?? 0,
      providerTypeName: raw.provider_type_name ?? '',
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
      .filter((s: Service) => Number(s.serviceType) === 2);
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
