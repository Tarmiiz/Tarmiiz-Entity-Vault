import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoadingController } from '@ionic/angular';
import {
  IonContent, IonTitle,
  IonToolbar,
  IonRow, IonCol
} from '@ionic/angular/standalone'

import { RpcService } from '../../../shared/services/rpc.service';
import { HeaderComponent } from "../../../shared/components/header/header.component";
import { Regulator } from 'src/app/shared/models/data.model';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    IonContent, IonTitle,
    CommonModule, FormsModule,
    HeaderComponent,
    IonToolbar,
    IonRow, IonCol
  ]
})
export class DashboardPage implements OnInit {

  regulatorInfo!: Regulator;

  currentBlock: number = 0;
  currentTrxs: number = 0;
  currentBlockTimestamp: number = 0;

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
