import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
import { ModalAssetRegisterExistingService } from '../modals/modal-asset-register-existing/modal-asset-register-existing.service';
import { ModalAssetRegisterExistingComponent } from '../modals/modal-asset-register-existing/modal-asset-register-existing.component';
import { AuditService } from '../../../../shared/services/audit.service';

import { Asset, User } from '../../../../shared/models/data.model';
import { AuthService } from '../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { applyPdfFooter } from '../../../../shared/utils/pdf-export.utils';
import { PaginatorComponent, pageSlice } from '../../../../shared/components/paginator/paginator.component';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    LiveIndicatorComponent,
    RouterLink, ModalAssetRegisterExistingComponent, TranslatePipe,
    PaginatorComponent,
  ]
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private socketService = inject(SocketService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  assetRegisterExistingService = inject(ModalAssetRegisterExistingService);
  private utils = inject(UtilsService);
  private authService = inject(AuthService);
  private auditService = inject(AuditService);
  features = inject(FeaturesService);
  private translate = inject(TranslateService);

  userInfo!: User;
  get entityActive() { return this.authService.entityActive(); }
  loadingData: boolean = false;
  refreshing = signal(false);

  assetsCount = 0;
  assets = signal<Asset[]>([]);

  filterType = signal<string>('');
  filterState = signal<string>('');
  filterCurrency = signal<string>('');
  filterCirculatingOp = signal<'' | 'gt' | 'lt'>('');
  filterCirculatingAmt = signal<number | null>(null);

  uniqueTypes = computed(() =>
    [...new Set(this.assets().map(a => a.supplyModeName).filter(Boolean))].sort()
  );

  uniqueCurrencies = computed(() =>
    [...new Set(this.assets().map(a => a.currencyCode).filter(Boolean))].sort()
  );

  /** 1-based, per frontend Standard 1.5. */
  assetsPage = signal(1);
  assetsPageSize = signal(25);
  pagedAssets = computed(() => pageSlice(this.filteredAssets(), this.assetsPage(), this.assetsPageSize()));
  filteredAssets = computed(() => {
    const type = this.filterType();
    const state = this.filterState();
    const currency = this.filterCurrency();
    const op = this.filterCirculatingOp();
    const amt = this.filterCirculatingAmt();
    return this.assets().filter(a => {
      if (type && a.supplyModeName !== type) return false;
      if (state && String(a.state) !== state) return false;
      if (currency && a.currencyCode !== currency) return false;
      if (op && amt !== null) {
        if (op === 'gt' && a.circulating <= amt) return false;
        if (op === 'lt' && a.circulating >= amt) return false;
      }
      return true;
    });
  });

  clearFilters() {
    this.filterType.set('');
    this.filterState.set('');
    this.filterCurrency.set('');
    this.filterCirculatingOp.set('');
    this.filterCirculatingAmt.set(null);
    this.assetsPage.set(1);
  }

  private _socketSub: Subscription | null = null;

  constructor() {}

  ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.assets.set([]);
    this.assetsCount = 0;
  }

  async ionViewDidEnter() {
    this.loadingData = true;
    await this.listAssets();
    this.loadingData = false;
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.listAssets(true));
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  getStateClass(stateId: number | undefined): string {
    if (stateId === undefined) return 'bg-gray-100 text-gray-800';
    switch(stateId) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  private mapVaultAsset(raw: any): Asset {
    const stateNames: Record<number, string> = {
      0: this.translate.instant('state.inactive'),
      1: this.translate.instant('state.initiated'),
      2: this.translate.instant('state.active'),
      3: this.translate.instant('state.suspended'),
      4: this.translate.instant('state.deactivated'),
    };
    return {
      address: raw.address,
      name: raw.name,
      symbol: raw.symbol,
      assetClass: raw.asset_class ?? 0,
      assetClassName: raw.asset_class_name ?? String(raw.asset_class ?? ''),
      metadata: typeof raw.metadata === 'object' ? JSON.stringify(raw.metadata ?? {}) : (raw.metadata ?? ''),
      totalSupply: raw.total_supply ?? 0,
      circulating: raw.circulating ?? 0,
      countryCode: 0,
      countryName: raw.country_name ?? '',
      currencyCode: raw.currency_code_iso ?? '',
      currencyName: raw.currency_name ?? '',
      createdOn: raw.created_on ?? 0,
      services: (raw.services ?? []).map((s: string) => ({ service: s, serviceName: s })),
      issuer: raw.issuer ?? '',
      issuerName: raw.issuer_name ?? raw.issuer ?? '',
      manager: raw.manager ?? '',
      managerName: raw.manager_name ?? raw.manager ?? '',
      regulator: raw.regulator ?? '',
      regulatorName: raw.regulator_name ?? '',
      regulatorSymbol: '',
      suspended: raw.suspended === true || raw.suspended === 1,
      canManage: raw.canManage === true || raw.can_manage === true || raw.can_manage === 1,
      creditSettlement: raw.credit_settlement === true || raw.credit_settlement === 1,
      state: raw.state ?? 0,
      stateName: raw.asset_state_name ?? stateNames[raw.state] ?? String(raw.state ?? ''),
      priceMode: raw.priceMode ?? raw.price_mode ?? 2,
      priceModeName: raw.priceModeName ?? raw.price_mode_name ?? (Number(raw.priceMode ?? raw.price_mode ?? 2) === 1 ? this.translate.instant('assets.enums.priceMode.single') : this.translate.instant('assets.enums.priceMode.bidAsk')),
      supplyMode: raw.supplyMode ?? raw.supply_mode ?? 1,
      supplyModeName: raw.supplyModeName ?? raw.supply_mode_name ?? (Number(raw.supplyMode ?? raw.supply_mode ?? 1) === 2 ? this.translate.instant('assets.enums.supplyMode.dynamic') : this.translate.instant('assets.enums.supplyMode.fixed')),
    };
  }

  async listAssets(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) {
      this.loadingService.show(this.translate.instant('common.loadingData'));
      this.assets.set([]);
    }
    try {
      const [result, servicesResult] = await Promise.all([
        this.apiService.vaultGetAssets(0, 500),
        this.apiService.vaultGetServices(0, 500),
      ]);
      const serviceNames: Record<string, string> = {};
      for (const s of (servicesResult?.services ?? [])) {
        serviceNames[s.address] = s.name;
      }
      if (result) {
        this.assetsCount = result.count;
        this.assets.set(result.assets.map((a: any) => {
          const asset = this.mapVaultAsset(a);
          asset.services = asset.services.map(s => ({
            ...s,
            serviceName: serviceNames[s.service] ?? s.service,
          }));
          return asset;
        }));
      }
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  async openRegisterExistingModal() {
    const r = await this.assetRegisterExistingService.show();
    if (!r?.registered) return;
    await this.listAssets();
    this.alertService.info(
      this.translate.instant('assets.list.registeredTitle'),
      this.translate.instant('assets.list.registeredMessage', { address: `${r.address.slice(0, 6)}…${r.address.slice(-4)}` })
    );
  }

  // The create wizard is the routed Asset Creator page since 2026-09-10 (R18 / Standard 2.5);
  // the create + attachment-upload flow that lived here moved with it.

  viewDetails(asset: Asset) {
    this.router.navigate(['/authorized/assets/details/' + asset.address]);
  }

  exportExcel() {
    const nameLabel = this.translate.instant('assets.table.name');
    const symbolLabel = this.translate.instant('assets.table.symbol');
    const currencyLabel = this.translate.instant('assets.table.currency');
    const typeLabel = this.translate.instant('assets.table.type');
    const circulatingLabel = this.translate.instant('assets.table.circulating');
    const stateLabel = this.translate.instant('assets.table.state');
    const suspendedLabel = this.translate.instant('assets.table.suspended');
    const yesLabel = this.translate.instant('common.yes');
    const noLabel = this.translate.instant('common.no');

    const rows = this.filteredAssets().map(a => ({
      [nameLabel]: a.name,
      [symbolLabel]: a.symbol,
      [currencyLabel]: a.currencyCode,
      [typeLabel]: a.supplyModeName,
      [circulatingLabel]: a.circulating,
      [stateLabel]: a.stateName,
      [suspendedLabel]: a.suspended ? yesLabel : noLabel,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, this.translate.instant('assets.title'));
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `assets_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'assets');
  }

  exportPdf() {
    const assets = this.filteredAssets();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    const noneLabel = this.translate.instant('common.none');

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(this.translate.instant('assets.title'), pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const circOp = this.filterCirculatingOp();
    const circAmt = this.filterCirculatingAmt();
    const circLabel = circOp && circAmt !== null ? `${circOp === 'gt' ? '>' : '<'} ${circAmt}` : noneLabel;
    const filterParts = [
      `${this.translate.instant('assets.filters.type')}: ${this.filterType() || noneLabel}`,
      `${this.translate.instant('assets.filters.state')}: ${this.filterState() || noneLabel}`,
      `${this.translate.instant('assets.filters.currency')}: ${this.filterCurrency() || noneLabel}`,
      `${this.translate.instant('assets.filters.circulating')}: ${circLabel}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`${this.translate.instant('common.filters')}: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: { 5: { halign: 'right' } },
      head: [[
        this.translate.instant('assets.table.id'),
        this.translate.instant('assets.table.name'),
        this.translate.instant('assets.table.symbol'),
        this.translate.instant('assets.table.currency'),
        this.translate.instant('assets.table.type'),
        { content: this.translate.instant('assets.table.circulating'), styles: { halign: 'right' } },
        this.translate.instant('assets.table.state'),
      ]],
      body: assets.map((a, i) => [
        i + 1,
        a.name,
        a.symbol,
        a.currencyCode,
        a.supplyModeName ?? (a.supplyMode === 2 ? this.translate.instant('assets.enums.supplyMode.dynamic') : this.translate.instant('assets.enums.supplyMode.fixed')),
        this.utils.formatTokens(a.circulating),
        a.suspended ? `${a.stateName} ${this.translate.instant('assets.list.suspendedSuffix')}` : a.stateName,
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`assets_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'assets');
  }
}
