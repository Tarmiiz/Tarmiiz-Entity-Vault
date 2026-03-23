import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonTitle } from '@ionic/angular/standalone'

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { Asset, AssetTransaction, Subscription, User } from '../../../shared/models/data.model';

import { RpcService } from '../../../shared/services/rpc.service';
import { UtilsService } from '../../../shared/services/utils.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/shared/services/auth.service';
import { ModalTransactionInfoService } from '../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../shared/components/modal-transaction-info/modal-transaction-info.component';

interface StatCard {
  title: string;
  value: number;
  path: string;
  icon: string;
  loading: boolean;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    IonTitle,
    CommonModule, FormsModule,
    HeaderComponent,
    ModalTransactionInfoComponent,
  ]
})
export class DashboardPage implements OnInit {
  private rpcService = inject(RpcService);
  utils = inject(UtilsService);
  private alertService = inject(AlertService);
  private router = inject(Router);
  private authService = inject(AuthService);
  private modalTransactionInfoService = inject(ModalTransactionInfoService);

  userInfo!: User;

  currentBlock: number = 0;
  currentTrxs: number = 0;
  currentBlockTimestamp: number = 0;

  assetsCount = 0
  assets = signal<Asset[]>([]);
  latestTransactions = signal<AssetTransaction[]>([]);
  transactionsLoading = signal(true);
  private unsubscribeTransactions: (() => void) | null = null;

  latestSubscriptions = signal<Subscription[]>([]);
  subscriptionsLoading = signal(true);
  private unsubscribeSubscriptions: (() => void) | null = null;

  stats = signal<StatCard[]>([
    { title: 'Total Services', value: 0, path: '/authorized/services/list', loading: true, icon: 'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm16 14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2ZM4 13a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Zm16-2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6Z' },
    { title: 'Total Assets', value: 0, path: '/authorized/assets/list', loading: true, icon: 'M16.872 9.687 20 6.56 17.44 4 4 17.44 6.56 20 16.873 9.687Zm0 0-2.56-2.56M6 7v2m0 0v2m0-2H4m2 0h2m7 7v2m0 0v2m0-2h-2m2 0h2M8 4h.01v.01H8V4Zm2 2h.01v.01H10V6Zm2-2h.01v.01H12V4Zm8 8h.01v.01H20V12Zm-2 2h.01v.01H18V14Zm2 2h.01v.01H20V16Z' },
    { title: 'Total Subscriptions', value: 0, path: '/authorized/subscriptions/list', loading: true, icon: 'M7 6H5m2 3H5m2 3H5m2 3H5m2 3H5m11-1a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2M7 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z' },
    { title: 'Total Transactions', value: 0, path: '/authorized/transactions/list', loading: true, icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3Z' },
  ]);

  constructor() { }

  async ngOnInit() {
    await this.loadPageData();
  }

  async goTo(path: string) {
    this.router.navigate([path]);
  }

  viewDetails(trx: AssetTransaction) {
    this.modalTransactionInfoService.show(trx);
  }

  async ionViewWillEnter() {
    await this.loadPageData();
    this.unsubscribeTransactions = this.rpcService.listenToAssetTransactions(async () => {
      const result = await this.rpcService.assetTransactions(1, 5);
      if (result.result && result.result.count !== this.stats()[3].value) {
        this.stats.update(cards => cards.map((c, i) => i === 3 ? { ...c, value: Number(result.result!.count) } : c));
        this.latestTransactions.set(result.result.transactions);
      }
    });
    this.unsubscribeSubscriptions = this.rpcService.listenToAssetTransactions(async () => {
      const result = await this.rpcService.subscriptionsListAllByEntity(1, 1000);
      if (result.result && result.result.count !== this.stats()[2].value) {
        this.stats.update(cards => cards.map((c, i) => i === 2 ? { ...c, value: Number(result.result!.count) } : c));
        this.latestSubscriptions.set([...result.result.subscriptions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5));
      }
    });
  }

  private async loadPageData() {
    await this.authService.ready();
    this.userInfo = this.authService.userInfo;
    if(!this.userInfo) this.router.navigate(['/public/user/login']);
    else {
      if(this.userInfo.role !== 1) {
        // await this.getValidators();
        await Promise.all([
          this.getStats(),
          this.getServices(),
          this.getAssets(),
          this.getSubscriptions(),
          this.getTransactions(),
        ]);
      }
    }
  }

  async getStats(){
    try {
      // this.entityInfo = await this.rpcService.entityInfoGet();
      const blockNumber = await this.rpcService.rpcProvider.getBlockNumber();
      const block = await this.rpcService.rpcProvider.getBlock(blockNumber);
      if (block) {
        this.currentBlock = blockNumber;
        this.currentTrxs = block.transactions.length;
        this.currentBlockTimestamp = block.timestamp;
      }
    } catch (error) {
      console.error('Error fetching initial block:', error);
    }

    this.rpcService.listenToNewBlocks((blockNumber, transactions, timestamp) => {
      this.currentBlock = blockNumber;
      this.currentTrxs = transactions;
      this.currentBlockTimestamp = timestamp;
    });
  }

  private setCardLoading(index: number, loading: boolean) {
    this.stats.update(cards => cards.map((c, i) => i === index ? { ...c, loading } : c));
  }

  async getServices() {
    this.setCardLoading(0, true);
    const lookup = await this.rpcService.servicesListOwn(1, 1);
    this.stats.update(cards => cards.map((c, i) => i === 0 ? { ...c, value: lookup.result ? Number(lookup.result.count) : c.value, loading: false } : c));
  }

  async getAssets() {
    this.setCardLoading(1, true);
    const lookup = await this.rpcService.assetsListOwn(1, 1);
    this.stats.update(cards => cards.map((c, i) => i === 1 ? { ...c, value: lookup.result ? Number(lookup.result.count) : c.value, loading: false } : c));
  }

  async getSubscriptions() {
    this.setCardLoading(2, true);
    this.subscriptionsLoading.set(true);
    const lookup = await this.rpcService.subscriptionsListAllByEntity(1, 1000);
    if (lookup.result) {
      this.stats.update(cards => cards.map((c, i) => i === 2 ? { ...c, value: Number(lookup.result!.count), loading: false } : c));
      this.latestSubscriptions.set([...lookup.result.subscriptions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5));
    } else {
      this.stats.update(cards => cards.map((c, i) => i === 2 ? { ...c, loading: false } : c));
    }
    this.subscriptionsLoading.set(false);
  }

  getStateClass(state: number): string {
    switch (state) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  async getTransactions() {
    this.setCardLoading(3, true);
    this.transactionsLoading.set(true);
    const lookup = await this.rpcService.assetTransactions(1, 5);
    if (lookup.result) {
      this.stats.update(cards => cards.map((c, i) => i === 3 ? { ...c, value: Number(lookup.result!.count), loading: false } : c));
      this.latestTransactions.set(lookup.result.transactions);
    } else {
      this.stats.update(cards => cards.map((c, i) => i === 3 ? { ...c, loading: false } : c));
    }
    this.transactionsLoading.set(false);
  }

  // async getValidators() {
  //   const lookup = await this.rpcService.validatorsListOwn(1, 1);
  // }


  async ionViewWillLeave() {
    this.rpcService.stopListening();
    this.unsubscribeTransactions?.();
    this.unsubscribeTransactions = null;
    this.unsubscribeSubscriptions?.();
    this.unsubscribeSubscriptions = null;
  }
}
