import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonTitle } from '@ionic/angular/standalone'

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { Asset, Regulator, User } from '../../../shared/models/data.model';

import { RpcService } from '../../../shared/services/rpc.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/shared/services/auth.service';

interface StatCard {
  title: string;
  value: number;
  path: string;
  icon: string;
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
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private router = inject(Router);
  private authService = inject(AuthService);

  regulatorInfo!: Regulator;
  userInfo!: User;

  currentBlock: number = 0;
  currentTrxs: number = 0;
  currentBlockTimestamp: number = 0;

  assetsCount = 0
  assets = signal<Asset[]>([]);

  stats = signal<StatCard[]>([
    { title: 'Total Assets', value: 0, path: '/authorized/assets/list', icon: 'M16.872 9.687 20 6.56 17.44 4 4 17.44 6.56 20 16.873 9.687Zm0 0-2.56-2.56M6 7v2m0 0v2m0-2H4m2 0h2m7 7v2m0 0v2m0-2h-2m2 0h2M8 4h.01v.01H8V4Zm2 2h.01v.01H10V6Zm2-2h.01v.01H12V4Zm8 8h.01v.01H20V12Zm-2 2h.01v.01H18V14Zm2 2h.01v.01H20V16Z' },
    { title: 'Total Services', value: 0, path: '/authorized/ckyc/services/list', icon: 'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm16 14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2ZM4 13a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Zm16-2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6Z' },
    { title: 'Total Identities', value: 0, path: '/authorized/identities/list', icon: 'M15 9h3m-3 3h3m-3 3h3m-6 1c-.306-.613-.933-1-1.618-1H7.618c-.685 0-1.312.387-1.618 1M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm7 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z' },
    { title: 'Total Subscriptions', value: 0, path: '/authorized/subscriptions/list', icon: 'M7 6H5m2 3H5m2 3H5m2 3H5m2 3H5m11-1a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2M7 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z' },
  ]);

  constructor() { }

  async ngOnInit() {}

  async goTo(path: string) { 
    this.router.navigate([path]);
  }
  
  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    if(!this.userInfo) this.router.navigate(['/login']);
    else {
      if(this.userInfo.role !== 1) {
        await this.getStats();
        // await this.getValidators();
        await this.getAssets();
        await this.getServices();
        await this.getIdentities();
        await this.getSubscriptions();
      } 
    }
  }

  async getStats(){
    this.loadingService.show('Loading data ...');
    try {
      this.regulatorInfo = this.rpcService.regulator;
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

    this.loadingService.hide();
  }

  async getAssets() {
    this.loadingService.show('Loading data ...');
    const lookup = await this.rpcService.assetsListByRegulator(1, 1);
    if(lookup.result) {
      this.stats()[0].value = Number(lookup.result.count);
    }
    this.loadingService.hide();
  }  

  // async getValidators() {
  //   this.loadingService.show('Loading data ...');
  //   const lookup = await this.rpcService.validatorsListOwn(1, 1);
  //   if(lookup.result) {
  //     this.stats()[0].value = Number(lookup.result.count);
  //   }
  //   this.loadingService.hide();
  // }

  async getServices() {
    this.loadingService.show('Loading data ...');
    const lookup = await this.rpcService.servicesListOwn(1, 1);
    if(lookup.result) {
      this.stats()[1].value = Number(lookup.result.count);
    }
    this.loadingService.hide();
  }

  async getIdentities() {
    this.loadingService.show('Loading data ...');
    const lookup = await this.rpcService.validatorsIdentitiesListOwn(1, 1);
    if(lookup.result) {
      this.stats()[2].value = Number(lookup.result.count);
    }
    this.loadingService.hide();
  }

  async getSubscriptions() {
    this.loadingService.show('Loading data ...');
    const lookup = await this.rpcService.subscriptionsListByRegulator(1, 1);
    if(lookup.result) {
      this.stats()[3].value = Number(lookup.result.count);
    }
    this.loadingService.hide();
  }  

  async ionViewWillLeave() {
    this.rpcService.stopListening();
  }  
}
