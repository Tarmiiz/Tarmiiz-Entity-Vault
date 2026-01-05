import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonTitle } from '@ionic/angular/standalone'

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { Regulator } from '../../../shared/models/data.model';

import { RpcService } from '../../../shared/services/rpc.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { Router } from '@angular/router';

interface StatCard {
  title: string;
  value: number;
  path: string;
  icon: string;
}

interface Asset {
  name: string;
  symbol: string;
  supply: number;
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

  regulatorInfo!: Regulator;

  currentBlock: number = 0;
  currentTrxs: number = 0;
  currentBlockTimestamp: number = 0;

  stats = signal<StatCard[]>([
    { title: 'Total Validators', value: 0, path: '/authorized/ckyc/validators/list', icon: 'M21 12a28.076 28.076 0 0 1-1.091 9M7.231 4.37a8.994 8.994 0 0 1 12.88 3.73M2.958 15S3 14.577 3 12a8.949 8.949 0 0 1 1.735-5.307m12.84 3.088A5.98 5.98 0 0 1 18 12a30 30 0 0 1-.464 6.232M6 12a6 6 0 0 1 9.352-4.974M4 21a5.964 5.964 0 0 1 1.01-3.328 5.15 5.15 0 0 0 .786-1.926m8.66 2.486a13.96 13.96 0 0 1-.962 2.683M7.5 19.336C9 17.092 9 14.845 9 12a3 3 0 1 1 6 0c0 .749 0 1.521-.031 2.311M12 12c0 3 0 6-2 9' },
    { title: 'Total Services', value: 0, path: '/authorized/ckyc/services/list', icon: 'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm16 14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2ZM4 13a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Zm16-2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6Z' },
    { title: 'Total Identities', value: 0, path: '/authorized/identities/list', icon: 'M15 9h3m-3 3h3m-3 3h3m-6 1c-.306-.613-.933-1-1.618-1H7.618c-.685 0-1.312.387-1.618 1M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm7 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z' }
  ]);

  assets = signal<Asset[]>([
    { name: 'Digital Egyptian Pound', symbol: 'EGP-D', supply: 1500000000 },
    { name: 'Gold-Backed Token', symbol: 'GOLD', supply: 150000 },
    { name: 'Treasury Bond 2028', symbol: 'TB-28', supply: 5000000 },
    { name: 'Real Estate Token', symbol: 'RET-01', supply: 250000 },
  ]);

  constructor() { }

  async ngOnInit() {}

  async goTo(path: string) { 
        this.router.navigate([path]);
  }
  
  async ionViewWillEnter() {

    // Initialize current block

    // await this.rpcService.operatorSet('0xBC08EDa7674EF880F19ec867fE4a1933f9bEbc9e');
    // const { loginHash, secret } = await this.rpcService.generateZKPData('admin@regulator3.com', '111111');
    // console.log(loginHash, secret);

    await this.getStats();
    await this.getValidators();
    await this.getServices();
    // await this.getIdentities();

  }

  async getStats(){
    this.loadingService.show('Loading data ...');
    try {
      this.regulatorInfo = this.rpcService.regulatorInfo;
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

  async getValidators() {
    this.loadingService.show('Loading data ...');
    const lookup = await this.rpcService.validatorsListOwn(1, 10);
    if(lookup.result) {
      this.stats()[0].value = Number(lookup.result.count);
    }
    this.loadingService.hide();
  }

  async getServices() {
    this.loadingService.show('Loading data ...');
    const lookup = await this.rpcService.servicesListAll(1, 10);
    if(lookup.result) {
      this.stats()[1].value = Number(lookup.result.count);
    }
    this.loadingService.hide();
  }

  async ionViewWillLeave() {
    this.rpcService.stopListening();
  }  
}
