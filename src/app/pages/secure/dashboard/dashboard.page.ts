import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoadingController } from '@ionic/angular';
import {
  IonContent, IonTitle,
} from '@ionic/angular/standalone'

import { RpcService } from '../../../shared/services/rpc.service';
import { HeaderComponent } from "../../../shared/components/header/header.component";
import { Regulator } from 'src/app/shared/models/data.model';

interface StatCard {
  title: string;
  value: number;
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
    IonContent, IonTitle,
    CommonModule, FormsModule,
    HeaderComponent,
  ]
})
export class DashboardPage implements OnInit {

  regulatorInfo!: Regulator;

  currentBlock: number = 0;
  currentTrxs: number = 0;
  currentBlockTimestamp: number = 0;

  stats = signal<StatCard[]>([
    { title: 'Total Validators', value: 2, icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21v-1a6 6 0 00-5.197-5.932' },
    { title: 'New Identities', value: 4, icon: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9A2.25 2.25 0 0018.75 6.75h-1.5a3 3 0 00-3-3h-3a3 3 0 00-3 3H7.5A2.25 2.25 0 005.25 9v3' },
    { title: 'Total Identities', value: 1204, icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.663M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z' }
  ]);

  assets = signal<Asset[]>([
    { name: 'Digital Egyptian Pound', symbol: 'EGP-D', supply: 1500000000 },
    { name: 'Gold-Backed Token', symbol: 'GOLD', supply: 150000 },
    { name: 'Treasury Bond 2028', symbol: 'TB-28', supply: 5000000 },
    { name: 'Real Estate Token', symbol: 'RET-01', supply: 250000 },
  ]);

  constructor(
    private loadingController: LoadingController,
    private rpcService: RpcService,
  ) { }

  async ngOnInit() {
    // await this.rpcService.info();
  }
  
  async ionViewWillEnter() {
    const loading = await this.loadingController.create({
      message: 'Loading events...'
    })
    await loading.present();
    
    // Initialize current block
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

    this.loadingController.dismiss();
  }

  async ionViewWillLeave() {
    this.rpcService.stopListening();
  }  
}
