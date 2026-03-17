import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AssetTransaction, Subscription, SubscriptionHolding } from '../../../../shared/models/data.model';
import { ModalSubscriptionStateService } from '../modals/modal-subscription-state/modal-subscription-state.service';
import { ModalSubscriptionStateComponent } from "../modals/modal-subscription-state/modal-subscription-state.component";
import { ModalTransactionInfoService } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.component';

import { environment } from '../../../../../environments/environment';


@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    RouterLink,
    ModalSubscriptionStateComponent,
    ModalTransactionInfoComponent
]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private rpcService = inject(RpcService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private subscriptionStateService = inject(ModalSubscriptionStateService);
  trxInfoService = inject(ModalTransactionInfoService);

  activeTab = signal<'info' | 'holdings' | 'trxs' | 'actions'>('info');

  loadingData: boolean = false;

  subscriptionAddress = '';
  subscription = signal<Subscription | undefined>(undefined);
  didHash = '';
  isOwn = false;

  holdings = signal<SubscriptionHolding[]>([]);
  holdingPage = signal(0);
  readonly holdingPageSize = 10;
  pagedHoldings = computed(() => {
    const start = this.holdingPage() * this.holdingPageSize;
    return this.holdings().slice(start, start + this.holdingPageSize);
  });
  totalHoldingPages = computed(() => Math.ceil(this.holdings().length / this.holdingPageSize));

  transactions = signal<AssetTransaction[]>([]);
  trxPage = signal(0);
  readonly trxPageSize = 10;
  pagedTransactions = computed(() => {
    const start = this.trxPage() * this.trxPageSize;
    return this.transactions().slice(start, start + this.trxPageSize);
  });
  totalTrxPages = computed(() => Math.ceil(this.transactions().length / this.trxPageSize));

  constructor() { 
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.subscriptionAddress = address;
    }    
  }

  async ngOnInit() {}
  
  async ionViewWillEnter() {
    await this.getSubscriptionDetails();
    this.isOwn = this.subscription()?.regulator === environment.regulatorAddress;
  }

  setTab(tab: 'info' | 'holdings' | 'trxs' | 'actions') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getSubscriptionDetails();
    if (tab === 'holdings') this.getHoldings(1, 500);
    if (tab === 'trxs') this.getTransactions(1, 100);
  }

  async getSubscriptionDetails() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.subscriptionInfo(this.subscriptionAddress);
    // console.log('service', data.result);
    if(data.result) this.subscription.set(data.result);
    const didInfo = await this.rpcService.subscriptionGetIdentityHash(this.subscriptionAddress);
    if(didInfo.result) this.didHash = didInfo.result;
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
  
  async openChangeStateModal(){
    const currentService = this.subscription();
    if (!currentService) return;

    const newState = await this.subscriptionStateService.show(currentService.state);
    if (newState !== null && newState !== currentService.state) {
        this.loadingService.show('Changing state...');
        try {
            await this.rpcService.subscriptionChangeState(currentService.subscription, newState);
            await this.getSubscriptionDetails();
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
    }    
  }

  getTrxTypeClass(trxType: string): string {
    switch (trxType) {
      case 'Subscribe': return 'bg-green-100 text-green-800';
      case 'Redeem':    return 'bg-orange-100 text-orange-800';
      default:          return 'bg-gray-100 text-gray-800';
    }
  }

  async getHoldings(start: number, offset: number) {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.assetHoldingsBySubscription(this.subscriptionAddress, start, offset);
    if (data.result?.holdings) this.holdings.set(data.result.holdings);
    this.holdingPage.set(0);
    this.loadingService.hide();
  }

  async gotoAsset(asset: string) {
    this.router.navigate(['/authorized/assets/details/' + asset]);
  }

  async getTransactions(start: number, offset: number) {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.assetTransactionsByAccount(this.subscriptionAddress, start, offset);
    if (data.result?.transactions) this.transactions.set(data.result.transactions);
    this.trxPage.set(0);
    this.loadingService.hide();
  }

  async gotoIdentity(entity: string) {
    this.router.navigate(['/authorized/entities/details/' + entity]);
  }  

  async gotoEntity(entity: string) {
    this.router.navigate(['/authorized/entities/details/' + entity]);
  }  

  async gotoService(service: string) {
    this.router.navigate(['/authorized/services/details/' + service]);
  }  

}
