import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../shared/components/header/header.component';
import { ApiService } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { FeaturesService } from '../../../shared/services/features.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { Service, User } from '../../../shared/models/data.model';
import { PaginatorComponent, pageSlice } from '../../../shared/components/paginator/paginator.component';

interface CustodyMandate {
  service: string;
  party: string;
  partyName: string;
  partyType: number;
  partyTypeName: string;
  active: boolean;
  updatedAt: number;
}

interface CustodiedAsset {
  address: string;
  name: string;
  symbol: string;
  state: number;
  stateName: string;
}

interface CustodyHold {
  assetAddress: string;
  holdId: number;
  accountAddress: string;
  amount: string;
  released: string;
  remaining: string;
  state: number;
  stateName: string;
  reason: string;
  releaseReason: string;
  placedBy: string;
  releasedBy: string;
  createdAt: number;
}

@Component({
  selector: 'app-custody',
  templateUrl: './custody.page.html',
  styleUrls: ['./custody.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, TranslatePipe, PaginatorComponent],
})
export class CustodyPage implements OnInit {
  private apiService     = inject(ApiService);
  private authService    = inject(AuthService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);
  private router         = inject(Router);
  // Public so the template can gate the Hold / Release buttons.
  features = inject(FeaturesService);

  userInfo!: User;

  // One tab per group. Holds live under 'assets', so a hold placed there never switches tabs.
  readonly tabs = ['services', 'underCustody', 'assets'] as const;
  activeTab = signal<'services' | 'underCustody' | 'assets'>('services');

  tabCount(tab: 'services' | 'underCustody' | 'assets'): number {
    if (tab === 'services') return this.myCustodianServices().length;
    if (tab === 'underCustody') return this.custodyMandates().length;
    return this.custodiedAssets().length;
  }

  // The entity's own services — every one is a custodian candidate; the mandates below are what
  // establish custodianship (see loadOwnCustodianServices).
  myCustodianServices = signal<Service[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  myServicesPage = signal(1);
  myServicesPageSize = signal(25);
  pagedMyServices = computed(() => pageSlice(this.myCustodianServices(), this.myServicesPage(), this.myServicesPageSize()));

  // Live reverse index (plugin-written custody_mandates from the ServicePartyChanged
  // announce fan-out): services that attached one of OUR services as their custodian.
  custodyMandates = signal<CustodyMandate[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  mandatesPage = signal(1);
  mandatesPageSize = signal(25);
  pagedMandates = computed(() => pageSlice(this.custodyMandates(), this.mandatesPage(), this.mandatesPageSize()));

  // Assets under custody (announce-fed mirror ⋈ mandates) + per-asset holds expand.
  custodiedAssets = signal<CustodiedAsset[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  custodiedPage = signal(1);
  custodiedPageSize = signal(25);
  pagedCustodied = computed(() => pageSlice(this.custodiedAssets(), this.custodiedPage(), this.custodiedPageSize()));
  expandedAsset = signal<string>('');
  assetHolds = signal<CustodyHold[]>([]);

  loaded = signal(false);

  // Own custodian service addresses (lowercase) — used to mark holds WE placed.
  private ownServiceAddrs = computed(() =>
    new Set(this.myCustodianServices().map(s => s.address.toLowerCase()))
  );

  // ── Place-hold modal state ────────────────────────────────────────────────
  holdModalOpen = signal(false);
  holdAsset = signal<string>('');
  holdAccount = '';
  holdAmount = '';
  holdReason = '';
  holdCustodianService = '';

  // ── Release-hold modal state ──────────────────────────────────────────────
  releaseModalOpen = signal(false);
  releaseHold = signal<CustodyHold | null>(null);
  releaseAmount = '';
  releaseReason = '';

  private readonly stateNames: Record<number, string> = {
    0: 'Inactive', 1: 'Initiated', 2: 'Active', 3: 'Suspended', 4: 'Deactivated',
  };

  ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      await Promise.all([
        this.loadOwnCustodianServices(),
        this.loadMandates(),
        this.loadCustodiedAssets(),
      ]);
    } finally {
      this.loadingService.hide();
      this.loaded.set(true);
    }
  }

  private mapService(raw: any): Service {
    return {
      address: raw.address,
      entity: raw.entity ?? '',
      name: raw.name,
      // ⚠️ Phase 28 step (e): service_type / service_type_name / party_class(_name) /
      // market_class(_name) / market_class_confirmed are GONE from `services_view`. The
      // license SET replaces them and is EMPTY until the licensing lane's read route lands —
      // deliberately not defaulted to anything that would render as a type.
      licenses: raw.licenses ?? [],
      state: raw.state ?? 0,
      stateName: raw.state_name ?? this.stateNames[raw.state] ?? String(raw.state ?? ''),
      suspended: raw.suspended === true || raw.suspended === 1,
    } as Service;
  }

  private async loadOwnCustodianServices() {
    const list = await this.apiService.vaultGetServicesOwn(0, 500);
    const all: Service[] = Array.isArray(list?.services) ? list!.services.map((s: any) => this.mapService(s)) : [];
    // ⚠️ WAS `Number(s.serviceType) === 2` (Phase 28 step (e)). There is no "service provider"
    // type any more, and — importantly — there is no single license that means it either: the
    // three license classes (27/28/29) are the MARKET family, i.e. the old type-1 half. A
    // custodian is a PARTY, admitted through the Regulators Registry's party machinery, which
    // this page already resolves separately via `custody_mandates`.
    //
    // So the filter is dropped rather than translated: every own service is a candidate, and the
    // MANDATE list below is what actually establishes custodianship. Translating it into a
    // license test would have invented a license that does not exist for this role.
    this.myCustodianServices.set(all);
  }

  private async loadMandates() {
    // Party Class 4 = Custodian. This read 3 — now BANK — so a custodian tenant's own
    // Custody page listed nothing, with no error to explain why.
    const data = await this.apiService.vaultCustodyMandates(4);
    this.custodyMandates.set(Array.isArray(data?.mandates) ? data.mandates : []);
  }

  private async loadCustodiedAssets() {
    const data = await this.apiService.vaultCustodyAssets();
    const rows = Array.isArray(data?.assets) ? data.assets : [];
    this.custodiedAssets.set(rows.map((a: any) => ({
      address:   a.address,
      name:      a.name ?? '',
      symbol:    a.symbol ?? '',
      state:     Number(a.state ?? 0),
      stateName: a.state_name ?? this.stateNames[Number(a.state ?? 0)] ?? '',
    })));
  }

  async toggleAssetHolds(asset: string) {
    if (this.expandedAsset() === asset) {
      this.expandedAsset.set('');
      this.assetHolds.set([]);
      return;
    }
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      const data = await this.apiService.vaultCustodyAssetHolds(asset, 1, 100);
      this.assetHolds.set(Array.isArray(data?.holds) ? data.holds : []);
      this.expandedAsset.set(asset);
    } finally {
      this.loadingService.hide();
    }
  }

  isOwnHold(h: CustodyHold): boolean {
    return this.ownServiceAddrs().has((h.placedBy || '').toLowerCase());
  }

  placedByLabel(h: CustodyHold): string {
    if (this.isOwnHold(h)) {
      const svc = this.myCustodianServices().find(s => s.address.toLowerCase() === h.placedBy.toLowerCase());
      return svc?.name || h.placedBy;
    }
    return this.translate.instant('custody.holds.regulator');
  }

  getStateClass(stateId: number | undefined): string {
    switch (stateId) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  holdStateClass(state: number): string {
    switch (state) {
      case 1: return 'bg-amber-100 text-amber-800';
      case 2: return 'bg-blue-100 text-blue-800';
      case 3: return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  gotoService(addr: string) {
    this.router.navigate(['/authorized/services/details/' + addr]);
  }

  // ── Place hold ────────────────────────────────────────────────────────────
  openHoldModal(asset: string) {
    this.holdAsset.set(asset);
    this.holdAccount = '';
    this.holdAmount = '';
    this.holdReason = '';
    this.holdCustodianService = this.myCustodianServices()[0]?.address || '';
    this.holdModalOpen.set(true);
  }

  async submitHold() {
    const asset = this.holdAsset();
    if (!this.holdCustodianService || !this.holdAccount || !Number(this.holdAmount)) return;
    this.holdModalOpen.set(false);
    this.loadingService.show(this.translate.instant('custody.holds.placing'));
    try {
      const res = await this.apiService.vaultCustodyHoldPlace({
        custodianService: this.holdCustodianService,
        asset,
        account: this.holdAccount.trim(),
        amount: String(Math.floor(Number(this.holdAmount))),
        reason: this.holdReason.trim(),
      });
      if (res?.requestId) {
        this.alertService.info(this.translate.instant('approvals.submittedTitle'), this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
      } else if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), typeof res.error === 'string' ? res.error : this.translate.instant('custody.holds.placeFailed'));
      } else {
        // Refresh the expanded holds table (the mirror lands via the plugin within a block).
        if (this.expandedAsset() === asset) {
          const data = await this.apiService.vaultCustodyAssetHolds(asset, 1, 100);
          this.assetHolds.set(Array.isArray(data?.holds) ? data.holds : []);
        }
      }
    } finally {
      this.loadingService.hide();
    }
  }

  // ── Release hold ──────────────────────────────────────────────────────────
  openReleaseModal(h: CustodyHold) {
    this.releaseHold.set(h);
    this.releaseAmount = h.remaining;
    this.releaseReason = '';
    this.releaseModalOpen.set(true);
  }

  async submitRelease() {
    const h = this.releaseHold();
    if (!h || !Number(this.releaseAmount)) return;
    // The relay must act as the custodian service that PLACED the hold (placer-scoped on-chain).
    const custodianService = h.placedBy;
    this.releaseModalOpen.set(false);
    this.loadingService.show(this.translate.instant('custody.holds.releasing'));
    try {
      const res = await this.apiService.vaultCustodyHoldRelease(h.assetAddress, h.holdId, {
        custodianService,
        amount: String(Math.floor(Number(this.releaseAmount))),
        reason: this.releaseReason.trim(),
      });
      if (res?.requestId) {
        this.alertService.info(this.translate.instant('approvals.submittedTitle'), this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
      } else if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), typeof res.error === 'string' ? res.error : this.translate.instant('custody.holds.releaseFailed'));
      } else {
        const asset = this.expandedAsset();
        if (asset) {
          const data = await this.apiService.vaultCustodyAssetHolds(asset, 1, 100);
          this.assetHolds.set(Array.isArray(data?.holds) ? data.holds : []);
        }
      }
    } finally {
      this.loadingService.hide();
    }
  }
}
