import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
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
  private rpcService = inject(RpcService);
  utils = inject(UtilsService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private serviceEditService = inject(ModalServiceEditService);
  private serviceStateService = inject(ModalServiceStateService);
  trxInfoService = inject(ModalTransactionInfoService);

  activeTab = signal<'overview' | 'info' | 'assets' | 'subscriptions' | 'trxs'>('overview');

  loadingData: boolean = false;

  serviceAddress = '';
  service = signal<Service | undefined>(undefined);
  subscriptions = signal<Subscription[]>([]);
  assets = signal<Asset[]>([]);
  transactions = signal<AssetTransaction[]>([]);
  trxPage = signal(0);
  readonly trxPageSize = 10;

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

  async getServiceDetails() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.serviceInfo(this.serviceAddress);
    this.service.set(data.result?.service);
    // console.log('service', this.service());
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
    const data = await this.rpcService.assetsListByService(this.serviceAddress, 1, 50);
    this.assets.set(data.result?.assets || []);
    this.loadingService.hide();
  }

  gotoAsset(asset: Asset) {
    this.router.navigate(['/authorized/assets/details/' + asset.address]);
  }
  
  async getSubscriptions() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.subscribersListByService(this.serviceAddress, 1, 50);
    this.subscriptions.set(data.result?.subscriptions || []);
    console.log('subscriptions', this.subscriptions());
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
          await this.rpcService.serviceChangeName(currentService.address, result.name!);
        }
        
        const dataChanged = result.email !== currentService.email || result.mobile !== currentService.mobile || result.website !== currentService.website;
        if (dataChanged) {
          await this.rpcService.serviceChangeData(currentService.address, JSON.stringify({ email: result.email!, mobile: result.mobile!, website: result.website! }));
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
            await this.rpcService.serviceChangeState(currentService.address, newState);
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
    const data = await this.rpcService.assetTransactionsByService(this.serviceAddress, start, offset);
    if (data.result?.transactions) this.transactions.set(data.result.transactions);
    this.trxPage.set(0);
    this.loadingService.hide();
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
