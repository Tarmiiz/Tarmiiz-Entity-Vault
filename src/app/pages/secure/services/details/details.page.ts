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
import { Asset, AssetTransaction, Service, Subscription } from '../../../../shared/models/data.model';
import { ModalServiceStateService } from '../modals/modal-service-state/modal-service-state.service';
import { ModalServiceStateComponent } from "../modals/modal-service-state/modal-service-state.component";
import { ModalServiceEditService } from '../modals/modal-service-edit/modal-service-edit.service';
import { ModalServiceEditComponent } from "../modals/modal-service-edit/modal-service-edit.component";
import { ModalTransactionInfoService } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.component';
import { SocketService } from '../../../../shared/services/socket.service';



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
    ModalTransactionInfoComponent
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
  private socketService = inject(SocketService);

  private _socketSub: RxSubscription | null = null;

  activeTab = signal<'overview' | 'info' | 'assets' | 'subscriptions' | 'trxs'>('overview');

  loadingData: boolean = false;

  serviceAddress = '';
  service = signal<Service | undefined>(undefined);
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

  uniqueTrxAssets = computed(() =>
    [...new Map(this.transactions().map(t => [t.asset, `${t.assetName} (${t.assetSymbol})`])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  uniqueTrxSubscriptions = computed(() =>
    [...new Set(this.transactions().filter(t => t.subscription).map(t => t.subscription))].sort()
  );

  filteredTrxs = computed(() => {
    const type = this.filterTrxType();
    const asset = this.filterTrxAsset();
    const sub = this.filterTrxSubscription();
    return this.transactions().filter(t =>
      (!type || t.trxType === type) &&
      (!asset || t.asset === asset) &&
      (!sub || t.subscription === sub)
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
    this.activeTab.set('overview');
    await this.reload();
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.reload());
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  private async reload() {
    await this.getServiceDetails();
    await Promise.all([
      this.getAssets(),
      this.getSubscriptions(),
      this.getTransactions(1, 50),
    ]);
  }

  setTab(tab: 'overview' | 'info' | 'assets' | 'subscriptions' | 'trxs') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getServiceDetails();
    if (tab === 'assets') this.getAssets();
    if (tab === 'subscriptions') this.getSubscriptions();
    if (tab === 'trxs') this.getTransactions(1, 50);
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
      regulator: raw.regulator ?? '',
      regulatorName: raw.regulator_name ?? '',
      regulatorSymbol: '',
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

  async getServiceDetails() {
    this.loadingService.show('Loading data...');
    const raw = await this.apiService.vaultGetService(this.serviceAddress);
    if (raw) this.service.set(this.mapVaultService(raw));
    this.loadingService.hide();
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

  async getAssets() {
    this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetAssets(0, 500, this.serviceAddress);
    if (data?.assets) this.assets.set(data.assets.map((a: any) => this.mapVaultAsset(a)));
    this.loadingService.hide();
  }

  gotoAsset(asset: Asset) {
    this.router.navigate(['/authorized/assets/details/' + asset.address]);
  }
  
  async getSubscriptions() {
    this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetSubscriptions(this.serviceAddress, 0, 500);
    if (data?.subscriptions) this.subscriptions.set(data.subscriptions.map((s: any) => this.mapVaultSubscription(s)));
    this.loadingService.hide();
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

    const newState = await this.serviceStateService.show(currentService.state);
    if (newState !== null && newState !== currentService.state) {
        this.loadingService.show('Changing state...');
        try {
            await this.apiService.vaultUpdateServiceState(currentService.address, newState);
            await this.getServiceDetails();
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
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

  async getTransactions(start: number, offset: number) {
    this.loadingService.show('Loading data...');
    const data = await this.apiService.vaultGetTransactions({ service: this.serviceAddress }, start - 1, offset);
    if (data?.transactions) this.transactions.set(data.transactions.map((t: any) => this.mapVaultTransaction(t)));
    this.trxPage.set(0);
    this.loadingService.hide();
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
    doc.text(`Generated: ${this.utils.formatDate(Math.floor(Date.now() / 1000))}`, pad, 21);

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
    doc.save(`assets_${svcName}_${stamp}.pdf`);
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
    doc.text(`Generated: ${this.utils.formatDate(Math.floor(Date.now() / 1000))}`, pad, 21);

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
    doc.save(`subscriptions_${svcName}_${stamp}.pdf`);
  }

  clearTrxFilters() {
    this.filterTrxType.set('');
    this.filterTrxAsset.set('');
    this.filterTrxSubscription.set('');
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
      'Price': t.price,
      'Total': t.totalPrice,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `transactions_${svcName}_${stamp}.xlsx`);
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
    doc.text(`Generated: ${this.utils.formatDate(Math.floor(Date.now() / 1000))}`, pad, 21);

    // ── filters line ──────────────────────────────────────────────
    const assetLabel = this.filterTrxAsset()
      ? (this.uniqueTrxAssets().find(a => a[0] === this.filterTrxAsset())?.[1] ?? this.filterTrxAsset())
      : 'None';
    const filterParts = [
      `Service: ${svcName}`,
      `Type: ${this.filterTrxType() || 'None'}`,
      `Asset: ${assetLabel}`,
      `Subscription: ${this.filterTrxSubscription() || 'None'}`,
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
      columnStyles: { 0: { cellWidth: 10 }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
      head: [[
        { content: '#' },
        { content: 'Time' },
        { content: 'Type' },
        { content: 'Asset' },
        { content: 'Subscription' },
        { content: 'Tokens', styles: { halign: 'right' } },
        { content: 'Price',  styles: { halign: 'right' } },
        { content: 'Total',  styles: { halign: 'right' } },
      ]],
      body: txs.map((t, i) => [
        i + 1,
        this.utils.formatDate(t.time),
        t.trxType,
        `${t.assetName} (${t.assetSymbol})`,
        t.subscription,
        this.utils.formatTokens(t.tokens),
        this.utils.formatPrice(t.price),
        this.utils.formatPrice(t.totalPrice),
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`transactions_${svcName}_${stamp}.pdf`);
  }

}
