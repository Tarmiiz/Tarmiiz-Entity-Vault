import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { Subscription as RxSubscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { ApiService } from '../../../../shared/services/api.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { Asset, AssetTransaction, Service, Subscription, User } from '../../../../shared/models/data.model';
import { AuthService } from '../../../../shared/services/auth.service';
import { applyPdfFooter } from '../../../../shared/utils/pdf-export.utils';
import { ModalServiceStateService } from '../modals/modal-service-state/modal-service-state.service';
import { ModalServiceStateComponent } from "../modals/modal-service-state/modal-service-state.component";
import { ModalServiceEditService } from '../modals/modal-service-edit/modal-service-edit.service';
import { ModalServiceEditComponent } from "../modals/modal-service-edit/modal-service-edit.component";
import { ModalTransactionInfoService } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.component';
import { ModalServiceValidatorService } from '../modals/modal-service-validator/modal-service-validator.service';
import { ModalServiceValidatorComponent } from '../modals/modal-service-validator/modal-service-validator.component';
import { ModalServicePaymentProcessorService } from '../modals/modal-service-payment-processor/modal-service-payment-processor.service';
import { ModalServicePaymentProcessorComponent } from '../modals/modal-service-payment-processor/modal-service-payment-processor.component';
import { SocketService } from '../../../../shared/services/socket.service';
import { AuditService } from '../../../../shared/services/audit.service';
import { DocumentsTabComponent } from '../../../../shared/components/documents-tab/documents-tab.component';
import { LiveIndicatorComponent } from '../../../../shared/components/live-indicator/live-indicator.component';



@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    RouterLink,
    ModalServiceEditComponent,
    ModalServiceStateComponent,
    ModalTransactionInfoComponent,
    ModalServiceValidatorComponent,
    ModalServicePaymentProcessorComponent,
    DocumentsTabComponent,
    LiveIndicatorComponent,
]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  utils = inject(UtilsService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private serviceEditService = inject(ModalServiceEditService);
  private serviceStateService = inject(ModalServiceStateService);
  trxInfoService = inject(ModalTransactionInfoService);
  private validatorModalService = inject(ModalServiceValidatorService);
  private paymentProcessorModalService = inject(ModalServicePaymentProcessorService);
  private socketService = inject(SocketService);
  private authService = inject(AuthService);
  private auditService = inject(AuditService);

  userInfo!: User;
  get entityActive() { return this.authService.entityActive(); }
  private _socketSub: RxSubscription | null = null;

  activeTab = signal<'overview' | 'info' | 'assets' | 'subscriptions' | 'trxs' | 'docs'>('overview');

  loadingData: boolean = false;
  refreshing = signal(false);

  serviceAddress = '';
  service = signal<Service | undefined>(undefined);
  withheldCredit  = signal<{ currencyCode: number; currencyName: string; currencySymbol: string; withheld: number }[]>([]);
  withheldAssets  = signal<{ asset: string; name: string; symbol: string; totalWithheld: number }[]>([]);
  isTokenIssuer = computed(() => this.service()?.serviceType === 1);
  suspensionReason = signal<string>('');
  validatorName = signal<string>('');
  paymentProcessorName = signal<string>('');
  subscriptions = signal<Subscription[]>([]);
  assets = signal<Asset[]>([]);
  transactions = signal<AssetTransaction[]>([]);
  trxPage = signal(0);
  readonly trxPageSize = 10;

  // assets tab filter + pagination
  filterAssetName = signal<string>('');
  filterAssetState = signal<string>('');
  assetPage = signal(0);
  readonly assetPageSize = 10;
  uniqueAssetStates = computed(() =>
    [...new Set(this.assets().map(a => a.stateName).filter(Boolean))].sort()
  );
  filteredAssets = computed(() => {
    const name = this.filterAssetName().toLowerCase().trim();
    const state = this.filterAssetState();
    return this.assets().filter(a =>
      (!name || a.name.toLowerCase().includes(name) || a.symbol.toLowerCase().includes(name)) &&
      (!state || a.stateName === state)
    );
  });
  pagedAssets = computed(() => {
    const start = this.assetPage() * this.assetPageSize;
    return this.filteredAssets().slice(start, start + this.assetPageSize);
  });
  totalAssetPages = computed(() => Math.ceil(this.filteredAssets().length / this.assetPageSize));

  // subscriptions tab filter + pagination
  filterSubAddress = signal<string>('');
  filterSubState = signal<string>('');
  subPage = signal(0);
  readonly subPageSize = 10;
  uniqueSubStates = computed(() =>
    [...new Set(this.subscriptions().map(s => s.stateName).filter(Boolean))].sort()
  );
  filteredSubscriptions = computed(() => {
    const addr = this.filterSubAddress().toLowerCase().trim();
    const state = this.filterSubState();
    return this.subscriptions().filter(s =>
      (!addr || s.subscription.toLowerCase().includes(addr)) &&
      (!state || s.stateName === state)
    );
  });
  pagedSubscriptions = computed(() => {
    const start = this.subPage() * this.subPageSize;
    return this.filteredSubscriptions().slice(start, start + this.subPageSize);
  });
  totalSubPages = computed(() => Math.ceil(this.filteredSubscriptions().length / this.subPageSize));

  filterTrxType = signal<string>('');
  filterTrxAsset = signal<string>('');
  filterTrxSubscription = signal<string>('');
  filterTrxStartDate = signal<string>('');
  filterTrxEndDate = signal<string>('');
  filterTrxCurrency = signal<string>('');

  uniqueTrxAssets = computed(() =>
    [...new Map(this.transactions().map(t => [t.asset, `${t.assetName} (${t.assetSymbol})`])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  uniqueTrxSubscriptions = computed(() =>
    [...new Set(this.transactions().filter(t => t.subscription).map(t => t.subscription))].sort()
  );

  uniqueTrxCurrencies = computed(() =>
    [...new Set(this.transactions().map(t => t.currencyCode).filter(Boolean))].sort()
  );

  filteredTrxs = computed(() => {
    const type = this.filterTrxType();
    const asset = this.filterTrxAsset();
    const sub = this.filterTrxSubscription();
    const currency = this.filterTrxCurrency();
    const startTs = this.filterTrxStartDate() ? Math.floor(new Date(this.filterTrxStartDate()).getTime() / 1000) : 0;
    const endTs   = this.filterTrxEndDate()   ? Math.floor(new Date(this.filterTrxEndDate()).getTime()   / 1000) + 86399 : Infinity;
    return this.transactions().filter(t =>
      (!type || t.trxType === type) &&
      (!asset || t.asset === asset) &&
      (!sub || t.subscription === sub) &&
      (!currency || t.currencyCode === currency) &&
      t.time >= startTs && t.time <= endTs
    );
  });

  pagedTransactions = computed(() => {
    const start = this.trxPage() * this.trxPageSize;
    return this.filteredTrxs().slice(start, start + this.trxPageSize);
  });
  totalTrxPages = computed(() => Math.ceil(this.filteredTrxs().length / this.trxPageSize));

  // overview computed signals
  subscribeCount = computed(() => this.transactions().filter(t => t.trxType === 'Subscribe').length);
  redeemCount = computed(() => this.transactions().filter(t => t.trxType === 'Redeem').length);
  lastTrx = computed(() => {
    const t = this.transactions();
    if (!t || t.length === 0) return null;
    return [...t].sort((a, b) => b.time - a.time)[0];
  });

  constructor() { 
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.serviceAddress = address;
    }    
  }

  async ngOnInit() {}
  
  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.activeTab.set('overview');
    await this.reload();
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.reload(true));
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  private async reload(silent = false) {
    if (silent) this.refreshing.set(true);
    try {
      await this.getServiceDetails(silent);
      await Promise.all([
        this.getAssets(silent),
        this.getSubscriptions(silent),
        this.getTransactions(1, 500, silent),
      ]);
    } finally {
      if (silent) this.refreshing.set(false);
    }
  }

  setTab(tab: 'overview' | 'info' | 'assets' | 'subscriptions' | 'trxs' | 'docs') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getServiceDetails();
    if (tab === 'assets') this.getAssets();
    if (tab === 'subscriptions') this.getSubscriptions();
    if (tab === 'trxs') this.getTransactions(1, 500);
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
      countryCode: raw.country_code ?? 0,
      countryName: raw.country_name ?? '',
      verificationLevel: raw.verification_level ?? 0,
      verificationLevelName: raw.verification_level_name ?? String(raw.verification_level ?? ''),
      serviceType: raw.service_type ?? 0,
      serviceTypeName: raw.service_type_name ?? '',
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

  private mapVaultAsset(raw: any): Asset {
    return {
      address: raw.address,
      name: raw.name,
      symbol: raw.symbol,
      tokenType: raw.token_type ?? 0,
      tokenTypeName: raw.token_type_name ?? String(raw.token_type ?? ''),
      assetType: raw.asset_type ?? 0,
      assetTypeName: raw.asset_type_name ?? String(raw.asset_type ?? ''),
      metadata: typeof raw.metadata === 'object' ? JSON.stringify(raw.metadata ?? {}) : (raw.metadata ?? ''),
      totalSupply: raw.total_supply ?? 0,
      circulating: raw.circulating ?? 0,
      countryCode: 0,
      countryName: raw.country_name ?? '',
      currencyCode: raw.currency_code ?? '',
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
      state: raw.state ?? 0,
      stateName: raw.asset_state_name ?? this.stateNames[raw.state] ?? String(raw.state ?? ''),
    } as Asset;
  }

  private mapVaultSubscription(raw: any): Subscription {
    return {
      subscription: raw.address,
      entity: raw.entity ?? '',
      entityName: '',
      service: raw.service ?? '',
      serviceName: '',
      validator: raw.validator ?? '',
      validatorName: '',
      validatorVerificationId: raw.validator_level ?? 0,
      validatorTimestamp: raw.validator_trx_ts ?? 0,
      regulator: raw.regulator ?? '',
      regulatorName: '',
      createdAt: raw.created_at ?? 0,
      suspended: raw.suspended === true || raw.suspended === 1,
      state: raw.state ?? 0,
      stateName: this.stateNames[raw.state] ?? String(raw.state ?? ''),
    } as Subscription;
  }

  private mapVaultTransaction(raw: any): AssetTransaction {
    let trxRefNo = '';
    if (raw.data && typeof raw.data === 'object') { trxRefNo = raw.data.trxRefNo || ''; }
    return {
      trxId: raw.id,
      serviceTrxId: raw.service_trx_id ?? 0,
      trxType: raw.type ? (raw.type.charAt(0).toUpperCase() + raw.type.slice(1)) : 'Transfer',
      sender: raw.sender ?? '',
      manager: raw.manager ?? '',
      managerName: raw.manager_name ?? raw.manager ?? '',
      service: raw.service ?? '',
      serviceName: raw.service_name ?? raw.service ?? '',
      asset: raw.asset ?? '',
      assetName: raw.asset_name ?? raw.asset ?? '',
      assetSymbol: raw.asset_symbol ?? '',
      currencyCode: raw.currency_code ?? '',
      from: raw.from_addr ?? '',
      to: raw.to_addr ?? '',
      subscription: raw.subscription ?? '',
      tokens: raw.tokens ?? 0,
      price: raw.price ?? 0,
      totalPrice: raw.total ?? 0,
      data: typeof raw.data === 'string' ? raw.data : JSON.stringify(raw.data ?? {}),
      trxRefNo,
      time: raw.time ?? 0,
    } as AssetTransaction;
  }

  async getServiceDetails(silent = false) {
    if (!silent) this.loadingService.show('Loading data...');
    const [raw, summary] = await Promise.all([
      this.apiService.vaultGetService(this.serviceAddress),
      this.apiService.vaultGetServiceWithheldSummary(this.serviceAddress).catch(() => null),
    ]);
    if (summary) {
      this.withheldCredit.set((summary.creditByCurrency ?? []).filter((c: any) => c.withheld > 0));
      this.withheldAssets.set((summary.assetsByAddress ?? []).filter((a: any) => a.totalWithheld > 0));
    }
    if (raw) {
      const service = this.mapVaultService(raw);
      this.service.set(service);
      this.resolveLinkedNames(raw.validator, raw.payment_processor);
      if (service.suspended) {
        const logs = await this.apiService.vaultGetStateChangeLogs(service.address, 1, 1);
        if (logs?.logs?.length > 0) {
          this.suspensionReason.set(logs.logs[0].reason || '');
        }
      } else {
        this.suspensionReason.set('');
      }
    }
    if (!silent) this.loadingService.hide();
  }

  private async resolveLinkedNames(validator: string, paymentProcessor: string) {
    const zeroAddr = '0x0000000000000000000000000000000000000000';
    this.validatorName.set('');
    this.paymentProcessorName.set('');

    const promises: Promise<void>[] = [];
    if (validator && validator !== zeroAddr) {
      promises.push(
        this.apiService.vaultGetValidators(1, 50).then(data => {
          const match = data?.validators?.find((v: any) => v.address.toLowerCase() === validator.toLowerCase());
          if (match?.name) this.validatorName.set(match.name);
        })
      );
    }
    if (paymentProcessor && paymentProcessor !== zeroAddr) {
      promises.push(
        this.apiService.vaultGetPaymentProcessors(1, 50).then(data => {
          const match = data?.paymentProcessors?.find((s: any) => s.address.toLowerCase() === paymentProcessor.toLowerCase());
          if (match?.name) this.paymentProcessorName.set(match.name);
        })
      );
    }
    await Promise.all(promises);
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

  async gotoEntity(address: string) {
    this.router.navigate(['/authorized/entities/details/' + address]);
  }

  async getAssets(silent = false) {
    if (!silent) this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetAssets(0, 500, this.serviceAddress);
    if (data?.assets) this.assets.set(data.assets.map((a: any) => this.mapVaultAsset(a)));
    if (!silent) this.loadingService.hide();
  }

  gotoAsset(asset: Asset) {
    this.router.navigate(['/authorized/assets/details/' + asset.address]);
  }
  
  async getSubscriptions(silent = false) {
    if (!silent) this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetSubscriptions(this.serviceAddress, 0, 500);
    if (data?.subscriptions) this.subscriptions.set(data.subscriptions.map((s: any) => this.mapVaultSubscription(s)));
    if (!silent) this.loadingService.hide();
  }

  async openEditModal() {
    const currentService = this.service();
    if (!currentService) return;

    const result = await this.serviceEditService.show(currentService);
    if (result) {
      this.loadingService.show('Updating service...');
      try {
        // Execute updates SEQUENTIALLY instead of in parallel
        if (result.name !== currentService.name) {
          await this.apiService.vaultUpdateServiceName(currentService.address, result.name!);
        }

        const dataChanged = result.email !== currentService.email || result.mobile !== currentService.mobile || result.website !== currentService.website;
        if (dataChanged) {
          await this.apiService.vaultUpdateServiceData(currentService.address, { email: result.email!, mobile: result.mobile!, website: result.website! });
        }

        // Normalize current values: treat zero address and empty string as equivalent
        const zeroAddr = '0x0000000000000000000000000000000000000000';
        const currentValidator = (currentService.validator && currentService.validator !== zeroAddr) ? currentService.validator : '';
        const currentPaymentProcessor = (currentService.paymentProcessor && currentService.paymentProcessor !== zeroAddr) ? currentService.paymentProcessor : '';

        if (result.validator !== currentValidator) {
          await this.apiService.vaultSetServiceValidator(currentService.address, result.validator || '');
        }

        if (result.paymentProcessor !== currentPaymentProcessor) {
          await this.apiService.vaultSetServicePaymentProcessor(currentService.address, result.paymentProcessor || '');
        }

        await this.getServiceDetails();

      } catch (error) {
        console.error('Failed to update service', error);
        this.alertService.show('Update Failed', 'There was an error updating the service details.');
      } finally {
        this.loadingService.hide();
      }
    }
  }

  async openChangeStateModal(){
    const currentService = this.service();
    if (!currentService) return;

    const result = await this.serviceStateService.show(currentService.state);
    if (result !== null && result.state !== currentService.state) {
        this.loadingService.show('Changing state...');
        try {
            await this.apiService.vaultUpdateServiceState(currentService.address, result.state, result.reason);
            await this.getServiceDetails();
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
    }    
  }

  async openChangeValidatorModal() {
    const currentService = this.service();
    if (!currentService) return;

    const newValidator = await this.validatorModalService.show(currentService.validator, currentService.verificationLevel);
    if (newValidator === null) return;

    const zeroAddr = '0x0000000000000000000000000000000000000000';
    const currentNormalized = (currentService.validator && currentService.validator !== zeroAddr) ? currentService.validator : '';
    if (newValidator === currentNormalized) return;

    this.loadingService.show('Updating validator...');
    try {
      await this.apiService.vaultSetServiceValidator(currentService.address, newValidator);
      await this.getServiceDetails();
    } catch (error) {
      console.error('Failed to change validator', error);
      this.alertService.show('Update Failed', 'There was an error updating the validator.');
    } finally {
      this.loadingService.hide();
    }
  }

  async openChangePaymentProcessorModal() {
    const currentService = this.service();
    if (!currentService) return;

    const newPaymentProcessor = await this.paymentProcessorModalService.show(currentService.paymentProcessor);
    if (newPaymentProcessor === null) return;

    const zeroAddr = '0x0000000000000000000000000000000000000000';
    const currentNormalized = (currentService.paymentProcessor && currentService.paymentProcessor !== zeroAddr) ? currentService.paymentProcessor : '';
    if (newPaymentProcessor === currentNormalized) return;

    this.loadingService.show('Updating payment processor...');
    try {
      await this.apiService.vaultSetServicePaymentProcessor(currentService.address, newPaymentProcessor);
      await this.getServiceDetails();
    } catch (error) {
      console.error('Failed to change payment processor', error);
      this.alertService.show('Update Failed', 'There was an error updating the payment processor.');
    } finally {
      this.loadingService.hide();
    }
  }

  async gotoValidator(validator: string) {
    this.router.navigate(['/authorized/validators/details/' + validator]);
  }

  async gotoSubscriber(subscription: string) {
    this.router.navigate(['/authorized/subscriptions/details/' + subscription]);
  }

  getTrxTypeClass(trxType: string): string {
    switch (trxType) {
      case 'Subscribe': return 'bg-green-100 text-green-800';
      case 'Redeem':    return 'bg-orange-100 text-orange-800';
      default:          return 'bg-gray-100 text-gray-800';
    }
  }

  async getTransactions(start: number, offset: number, silent = false) {
    if (!silent) this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetTransactions({ service: this.serviceAddress }, start - 1, offset);
    if (data?.transactions) this.transactions.set(data.transactions.map((t: any) => this.mapVaultTransaction(t)));
    this.trxPage.set(0);
    if (!silent) this.loadingService.hide();
  }

  clearAssetFilters() {
    this.filterAssetName.set('');
    this.filterAssetState.set('');
    this.assetPage.set(0);
  }

  exportAssetsExcel() {
    const svcName = this.service()?.name ?? 'service';
    const rows = this.filteredAssets().map(a => ({
      'Name': a.name,
      'Symbol': a.symbol,
      'Issuer': a.issuerName,
      'Type': a.assetTypeName,
      'State': a.stateName,
      'Suspended': a.suspended ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assets');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `assets_${svcName}_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'service_assets');
  }

  exportAssetsPdf() {
    const svcName = this.service()?.name ?? 'Service';
    const assetsList = this.filteredAssets();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Assets — ${svcName}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const filterParts = [
      `Name: ${this.filterAssetName() || 'None'}`,
      `State: ${this.filterAssetState() || 'None'}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Filters: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [[
        { content: '#' },
        { content: 'Name' },
        { content: 'Symbol' },
        { content: 'Issuer' },
        { content: 'Type' },
        { content: 'State' },
      ]],
      body: assetsList.map((a, i) => [
        i + 1,
        a.name,
        a.symbol,
        a.issuerName,
        a.assetTypeName,
        a.suspended ? `${a.stateName} (Suspended)` : a.stateName,
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`assets_${svcName}_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'service_assets');
  }

  clearSubFilters() {
    this.filterSubAddress.set('');
    this.filterSubState.set('');
    this.subPage.set(0);
  }

  exportSubsExcel() {
    const svcName = this.service()?.name ?? 'service';
    const rows = this.filteredSubscriptions().map(s => ({
      'Date': this.utils.formatDate(s.createdAt),
      'Subscription': s.subscription,
      'State': s.stateName,
      'Suspended': s.suspended ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subscriptions');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `subscriptions_${svcName}_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'service_subscriptions');
  }

  exportSubsPdf() {
    const svcName = this.service()?.name ?? 'Service';
    const subs = this.filteredSubscriptions();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Subscriptions — ${svcName}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const filterParts = [
      `Address: ${this.filterSubAddress() || 'None'}`,
      `State: ${this.filterSubState() || 'None'}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Filters: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [[
        { content: '#' },
        { content: 'Date' },
        { content: 'Subscription' },
        { content: 'State' },
      ]],
      body: subs.map((s, i) => [
        i + 1,
        this.utils.formatDate(s.createdAt),
        s.subscription,
        s.suspended ? `${s.stateName} (Suspended)` : s.stateName,
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`subscriptions_${svcName}_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'service_subscriptions');
  }

  clearTrxFilters() {
    this.filterTrxType.set('');
    this.filterTrxAsset.set('');
    this.filterTrxSubscription.set('');
    this.filterTrxCurrency.set('');
    this.filterTrxStartDate.set('');
    this.filterTrxEndDate.set('');
    this.trxPage.set(0);
  }

  exportTrxExcel() {
    const svcName = this.service()?.name ?? 'service';
    const rows = this.filteredTrxs().map(t => ({
      'Time': this.utils.formatDate(t.time),
      'Type': t.trxType,
      'Asset': `${t.assetName} (${t.assetSymbol})`,
      'Subscription': t.subscription,
      'Tokens': t.tokens,
      'Currency': t.currencyCode,
      'Price': t.price,
      'Total': t.totalPrice,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `transactions_${svcName}_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'service_transactions');
  }

  exportTrxPdf() {
    const svcName = this.service()?.name ?? 'Service';
    const txs = this.filteredTrxs();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Transactions — ${svcName}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    // ── filters line ──────────────────────────────────────────────
    const assetLabel = this.filterTrxAsset()
      ? (this.uniqueTrxAssets().find(a => a[0] === this.filterTrxAsset())?.[1] ?? this.filterTrxAsset())
      : 'None';
    const filterParts = [
      `Service: ${svcName}`,
      `Type: ${this.filterTrxType() || 'None'}`,
      `Asset: ${assetLabel}`,
      `Subscription: ${this.filterTrxSubscription() || 'None'}`,
      `From: ${this.filterTrxStartDate() || 'None'}`,
      `To: ${this.filterTrxEndDate() || 'None'}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Filters: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    const subs   = txs.filter(t => t.trxType === 'Subscribe');
    const redeem = txs.filter(t => t.trxType === 'Redeem');
    const sumTokens = (arr: typeof txs) => arr.reduce((s, t) => s + Number(t.tokens), 0);
    const sumTotal  = (arr: typeof txs) => arr.reduce((s, t) => s + Number(t.totalPrice), 0);

    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      head: [[
        { content: 'Type' },
        { content: 'Count',         styles: { halign: 'center' } },
        { content: 'Assets',        styles: { halign: 'center' } },
        { content: 'Subscriptions', styles: { halign: 'center' } },
        { content: 'Tokens',        styles: { halign: 'right'  } },
        { content: 'Value',         styles: { halign: 'right'  } },
      ]],
      body: [
        ['Subscribe', subs.length,   new Set(subs.map(t => t.asset)).size,   new Set(subs.map(t => t.subscription)).size,   this.utils.formatTokens(sumTokens(subs)),   this.utils.formatPrice(sumTotal(subs))],
        ['Redeem',    redeem.length,  new Set(redeem.map(t => t.asset)).size, new Set(redeem.map(t => t.subscription)).size, this.utils.formatTokens(sumTokens(redeem)), this.utils.formatPrice(sumTotal(redeem))],
      ],
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: { 0: { cellWidth: 10 }, 5: { halign: 'center' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
      head: [[
        { content: '#' },
        { content: 'Time' },
        { content: 'Type' },
        { content: 'Asset' },
        { content: 'Subscription' },
        { content: 'Currency', styles: { halign: 'center' } },
        { content: 'Tokens',   styles: { halign: 'right'  } },
        { content: 'Price',    styles: { halign: 'right'  } },
        { content: 'Total',    styles: { halign: 'right'  } },
      ]],
      body: txs.map((t, i) => [
        i + 1,
        this.utils.formatDate(t.time),
        t.trxType,
        `${t.assetName} (${t.assetSymbol})`,
        t.subscription,
        t.currencyCode,
        this.utils.formatTokens(t.tokens),
        this.utils.formatPrice(t.price),
        this.utils.formatPrice(t.totalPrice),
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`transactions_${svcName}_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'service_transactions');
  }

  openTransactionInfo(trx: AssetTransaction) {
    this.trxInfoService.show(trx);
    this.auditService.logView('transaction', { id: trx.trxId });
  }

}
