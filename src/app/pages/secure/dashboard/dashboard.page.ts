import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonTitle } from '@ionic/angular/standalone'

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { Asset, Entity, User } from '../../../shared/models/data.model';

import { RpcService } from '../../../shared/services/rpc.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/shared/services/auth.service';

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
  ]
})
export class DashboardPage implements OnInit {
  private rpcService = inject(RpcService);
  private alertService = inject(AlertService);
  private router = inject(Router);
  private authService = inject(AuthService);

  entityInfo!: Entity;
  userInfo!: User;

  currentBlock: number = 0;
  currentTrxs: number = 0;
  currentBlockTimestamp: number = 0;

  assetsCount = 0
  assets = signal<Asset[]>([]);

  stats = signal<StatCard[]>([
    { title: 'Total Entities', value: 0, path: '/authorized/entities/list', loading: true, icon: 'M6 4h12M6 4v16M6 4H5m13 0v16m0-16h1m-1 16H6m12 0h1M6 20H5M9 7h1v1H9V7Zm5 0h1v1h-1V7Zm-5 4h1v1H9v-1Zm5 0h1v1h-1v-1Zm-3 4h2a1 1 0 0 1 1 1v4h-4v-4a1 1 0 0 1 1-1Z' },
    { title: 'Total Services', value: 0, path: '/authorized/services/list', loading: true, icon: 'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm16 14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2ZM4 13a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Zm16-2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6Z' },
    { title: 'Total Assets', value: 0, path: '/authorized/assets/list', loading: true, icon: 'M16.872 9.687 20 6.56 17.44 4 4 17.44 6.56 20 16.873 9.687Zm0 0-2.56-2.56M6 7v2m0 0v2m0-2H4m2 0h2m7 7v2m0 0v2m0-2h-2m2 0h2M8 4h.01v.01H8V4Zm2 2h.01v.01H10V6Zm2-2h.01v.01H12V4Zm8 8h.01v.01H20V12Zm-2 2h.01v.01H18V14Zm2 2h.01v.01H20V16Z' },
    { title: 'Total Identities', value: 0, path: '/authorized/identities/list', loading: true, icon: 'M15 9h3m-3 3h3m-3 3h3m-6 1c-.306-.613-.933-1-1.618-1H7.618c-.685 0-1.312.387-1.618 1M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm7 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z' },
    { title: 'Total Subscriptions', value: 0, path: '/authorized/subscriptions/list', loading: true, icon: 'M7 6H5m2 3H5m2 3H5m2 3H5m2 3H5m11-1a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2M7 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z' },
  ]);

  constructor() { }

  async ngOnInit() {
    await this.loadPageData();
  }

  async goTo(path: string) {
    this.router.navigate([path]);
  }

  async ionViewWillEnter() {
    await this.loadPageData();
  }

  private async loadPageData() {
    await this.authService.ready();
    this.userInfo = this.authService.userInfo;
    if(!this.userInfo) this.router.navigate(['/public/user/login']);
    else {
      if(this.userInfo.role !== 1) {
        await this.getStats();
        // await this.getValidators();
        await Promise.all([
          this.getEntities(),
          this.getServices(),
          this.getAssets(),
          this.getIdentities(),
          this.getSubscriptions(),
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

  async getEntities() {
    this.setCardLoading(0, true);
    const lookup = await this.rpcService.entitiesListOwn(1, 1);
    this.stats.update(cards => cards.map((c, i) => i === 0 ? { ...c, value: lookup.result ? Number(lookup.result.count) : c.value, loading: false } : c));
  }

  async getServices() {
    this.setCardLoading(1, true);
    const lookup = await this.rpcService.servicesListOwn(1, 1);
    this.stats.update(cards => cards.map((c, i) => i === 1 ? { ...c, value: lookup.result ? Number(lookup.result.count) : c.value, loading: false } : c));
  }

  async getAssets() {
    this.setCardLoading(2, true);
    const lookup = await this.rpcService.assetsListByRegulator(1, 1);
    this.stats.update(cards => cards.map((c, i) => i === 2 ? { ...c, value: lookup.result ? Number(lookup.result.count) : c.value, loading: false } : c));
  }

  async getIdentities() {
    this.setCardLoading(3, true);
    const lookup = await this.rpcService.validatorsIdentitiesListOwn(1, 1);
    this.stats.update(cards => cards.map((c, i) => i === 3 ? { ...c, value: lookup.result ? Number(lookup.result.count) : c.value, loading: false } : c));
  }

  async getSubscriptions() {
    this.setCardLoading(4, true);
    const lookup = await this.rpcService.subscriptionsListByRegulator(1, 1);
    this.stats.update(cards => cards.map((c, i) => i === 4 ? { ...c, value: lookup.result ? Number(lookup.result.count) : c.value, loading: false } : c));
  }

  // async getValidators() {
  //   const lookup = await this.rpcService.validatorsListOwn(1, 1);
  // }

  async ionViewWillLeave() {
    this.rpcService.stopListening();
  }
}
