import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { Subscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";
import { LiveIndicatorComponent } from "../../../../shared/components/live-indicator/live-indicator.component";

import { ApiService } from '../../../../shared/services/api.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { ModalServiceAddService } from '../modals/modal-service-add/modal-service-add.service';
import { ModalServiceAddComponent } from '../modals/modal-service-add/modal-service-add.component';

import { Service, User } from '../../../../shared/models/data.model';
import { AuthService } from '../../../../shared/services/auth.service';
import { AuditService } from '../../../../shared/services/audit.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { applyPdfFooter } from '../../../../shared/utils/pdf-export.utils';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { PaginatorComponent, pageSlice } from '../../../../shared/components/paginator/paginator.component';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    DecimalPipe,
    HeaderComponent,
    LiveIndicatorComponent,
    ModalServiceAddComponent, TranslatePipe, MoneyPipe,
    PaginatorComponent,
  ]
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private socketService = inject(SocketService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private serviceAddService = inject(ModalServiceAddService);
  private utils = inject(UtilsService);
  private authService = inject(AuthService);
  private auditService = inject(AuditService);
  private translate = inject(TranslateService);
  features = inject(FeaturesService);

  get isServiceProvider() { return this.features.isServiceProvider(); }

  userInfo!: User;
  get entityActive() { return this.authService.entityActive(); }
  loadingServices: boolean = false;
  refreshing = signal(false);
  showAllServices = signal(false);

  servicesCount = 0
  services = signal<Service[]>([]);
  servicesSearchTerm = signal('');
  coverageByService = signal<Record<string, { minRatio: number | null; worstCurrency: string | null; totalShortfall: number; breakdown: { currency: string; obligation: number; liquidity: number; shortfall: number; coverageRatio: number | null }[] }>>({});

  coverageFor(addr: string) {
    return this.coverageByService()[addr?.toLowerCase()] ?? null;
  }
  coverageTone(ratio: number | null | undefined): 'good' | 'warn' | 'bad' | 'idle' {
    if (ratio === null || ratio === undefined) return 'idle';
    if (ratio >= 1) return 'good';
    if (ratio >= 0.5) return 'warn';
    return 'bad';
  }

  filterState = signal<string>('');
  filterVerificationLevel = signal<string>('');

  uniqueVerificationLevels = computed(() =>
    [...new Map(this.services().map(s => [s.verificationLevel, s.verificationLevelName])).entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
  );

  clearFilters() {
    this.filterState.set('');
    this.filterVerificationLevel.set('');
    this.servicesPage.set(1);
  }

  private _socketSub: Subscription | null = null;

  constructor() {}

  ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.services.set([]);
    this.servicesCount = 0;
  }

  async ionViewDidEnter() {
    this.loadingServices = true;
    await this.listServices();
    this.loadingServices = false;
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.listServices(true));
  }

  // ── LICENSES replace the type/sub-type pair (Phase 28 step (e), 2026-09-03) ──────────────
  //
  // The retired `typeDisplay` joined `serviceTypeName` to whichever sub-type matched the type,
  // and its comment warned never to read the wrong one — both catalogs numbered from 1, so a
  // Payment Gateway rendered as an "Exchange". That hazard is gone with the fields; the new one
  // is different and worth naming: a service holds a SET, so there is no single value to show.
  //
  // ⚠️ `showMarketClassPill` / the confirmed-vs-awaiting pill are GONE WITH NO SUCCESSOR. A
  // license has no separate confirmation to display — it is Active precisely BECAUSE a regulator
  // approved it, and a suspended one simply stops being listed. Rendering "awaiting confirmation"
  // for a license would invent a state the ledger does not have.
  //
  // 🔴 RENDERS "—" UNTIL THE LICENSE READ ROUTE EXISTS. `Service.licenses` is empty on every row
  // today: the Entity API has the chain helpers but no route exposing them, and that read belongs
  // to the licensing lane. A dash is the honest placeholder — do NOT substitute a guess from
  // another field to make the column look populated.
  private static readonly LICENSE_NAMES: Record<number, string> =
    { 27: 'Token Issuer', 28: 'Exchange', 29: 'Brokerage' };
  typeDisplay(s: Service): string {
    const ids = s.licenses ?? [];
    if (!ids.length) return '—';
    return ids.map((i) => ListPage.LICENSE_NAMES[i] ?? `Class ${i}`).join(', ');
  }

  getStateClass(stateId: number | undefined): string {
    if (stateId === undefined) return 'bg-gray-100 text-gray-800';
    switch(stateId) {
      case 1: return 'bg-yellow-100 text-yellow-800'; // Initiated
      case 2: return 'bg-green-100 text-green-800';   // Active
      case 3: return 'bg-orange-100 text-orange-800'; // Suspended
      case 4: return 'bg-red-100 text-red-800';       // Deactivated
      default: return 'bg-gray-100 text-gray-800';
    }
  } 

  async onToggleChange(event: Event) {
    const checkbox = event.target as HTMLInputElement;
    this.showAllServices.set(checkbox.checked);
    await this.listServices();
  } 

  private mapVaultService(raw: any): Service {
    const stateNames: Record<number, string> = {
      0: this.translate.instant('state.inactive'),
      1: this.translate.instant('state.initiated'),
      2: this.translate.instant('state.active'),
      3: this.translate.instant('state.suspended'),
      4: this.translate.instant('state.deactivated'),
    };
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
      stateName: raw.state_name ?? stateNames[raw.state] ?? String(raw.state ?? ''),
    } as Service;
  }

  async listServices(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) {
      this.loadingService.show(this.translate.instant('common.loadingData'));
      this.services.set([]);
    }
    try {
      const [result, coverage] = await Promise.all([
        this.apiService.vaultGetServices(0, 500),
        this.apiService.vaultGetServicesCoverage().catch(() => []),
      ]);
      if (result) {
        this.servicesCount = result.count;
        this.services.set(result.services.map((s: any) => this.mapVaultService(s)));
      }
      const cov: Record<string, any> = {};
      for (const c of (coverage || [])) cov[(c.service || '').toLowerCase()] = c;
      this.coverageByService.set(cov);
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  async openAddModal() {
    const data = await this.serviceAddService.show();
    if (!data) return;

    this.loadingService.show(this.translate.instant('services.list.creatingService'));
    try {
      const entityInfo = await this.apiService.vaultGetEntityInfo();
      const result = await this.apiService.vaultCreateService({
        name: data.name,
        metadata: JSON.stringify({ description: data.description, website: data.website, email: data.email, mobile: data.mobile }),
        verification_level: data.verificationLevel,
        // ⚠️ `service_type` is GONE (Phase 28 step (e)) — the endpoint's selector changed and
        // three arguments were removed from the MIDDLE, so sending the old shape would not be
        // ignored, it would mis-bind. What the operator applied for travels here instead.
        request_licenses: data.requestLicenses,
        country_code: (entityInfo as any)?.country_code ?? 0,
        regulator: data.regulator,
        validator: data.validator || '',
        // No `payment_processor` — the Entity API ignores it. A payment provider attaches per
        // CURRENCY under a payRole validated against that currency's election, and the election
        // is declared by the service's REGULATOR, so nothing is attachable at create time.
        custodian: data.custodian || '',
        clearing_house: data.clearingHouse || '',
        visibility: data.visibility || 1,
      });
      // `vaultPost` returns `{ error }` on failure — a TRUTHY object — so a bare `if (result)` took
      // the success branch on every failure and the error alert below was unreachable. The address
      // is the only honest success signal, and it is what the follow-up calls need anyway.
      const newAddress: string = result?.address ?? '';
      if (newAddress) {
        // ⚠️ NO post-create election declare / payment-provider attach here, and there cannot be
        // one. `P_ELECTION_DECLARE` is gated `K_REGULATOR_OF`: the REGULATOR declares a service's
        // initial onc/offc election, per currency. An entity-side declare call would simply be
        // refused, so the wizard collects neither the currency nor the election, and a payment
        // provider — whose payRole is validated against that election — has nothing to attach
        // under until the regulator has acted.
        await this.listServices();
      } else {
        this.alertService.info(this.translate.instant('alerts.error'), result?.error || this.translate.instant('services.list.createFailed'));
      }
    } catch (error) {
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  viewDetails(service: Service) {
    this.router.navigate(['/authorized/services/details/' + service.address]);
  }

  /** 1-based, per frontend Standard 1.5. */
  servicesPage = signal(1);
  servicesPageSize = signal(25);
  pagedServices = computed(() => pageSlice(this.filteredServices(), this.servicesPage(), this.servicesPageSize()));
  filteredServices = computed(() => {
    const state = this.filterState();
    const level = this.filterVerificationLevel();
    return this.services().filter(s =>
      (!state || String(s.state) === state) &&
      (!level || String(s.verificationLevel) === level)
    );
  });  

  onServicesSearch(event: Event) {
    this.servicesSearchTerm.set((event.target as HTMLInputElement).value);
  }

  exportExcel() {
    const nameLabel = this.translate.instant('services.table.name');
    const verificationLabel = this.translate.instant('services.table.verificationLevel');
    const regulatorLabel = this.translate.instant('services.table.regulator');
    const stateLabel = this.translate.instant('services.table.state');
    const suspendedLabel = this.translate.instant('services.table.suspended');
    const yesLabel = this.translate.instant('common.yes');
    const noLabel = this.translate.instant('common.no');

    const rows = this.filteredServices().map(s => ({
      [nameLabel]: s.name,
      ...(this.isServiceProvider ? {} : { [verificationLabel]: s.verificationLevelName }),
      ...(this.showAllServices() ? { [regulatorLabel]: s.regulatorSymbol } : {}),
      [stateLabel]: s.stateName,
      [suspendedLabel]: s.suspended ? yesLabel : noLabel,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, this.translate.instant('services.title'));
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `services_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'services');
  }

  exportPdf() {
    const services = this.filteredServices();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    const noneLabel = this.translate.instant('common.none');

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(this.translate.instant('services.title'), pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const filterParts = [
      ...(this.isServiceProvider ? [] : [`${this.translate.instant('services.filters.verificationLevel')}: ${this.filterVerificationLevel() ? (this.uniqueVerificationLevels().find(l => String(l[0]) === this.filterVerificationLevel())?.[1] ?? this.filterVerificationLevel()) : noneLabel}`]),
      `${this.translate.instant('services.filters.state')}: ${this.filterState() || noneLabel}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`${this.translate.instant('common.filters')}: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    const showRegulator = this.showAllServices();
    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [[
        this.translate.instant('services.table.id'),
        this.translate.instant('services.table.name'),
        ...(this.isServiceProvider ? [] : [this.translate.instant('services.table.verificationLevel')]),
        ...(showRegulator ? [this.translate.instant('services.table.regulator')] : []),
        this.translate.instant('services.table.state'),
      ]],
      body: services.map((s, i) => [
        i + 1,
        s.name,
        ...(this.isServiceProvider ? [] : [s.verificationLevelName]),
        ...(showRegulator ? [s.regulatorSymbol] : []),
        s.suspended ? `${s.stateName} ${this.translate.instant('services.list.suspendedSuffix')}` : s.stateName,
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`services_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'services');
  }

}
