import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoadingController } from '@ionic/angular';
import { 
  IonContent,
  IonGrid, IonRow, IonCol,
  IonSkeletonText,
  IonToolbar
} from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';

@Component({
  selector: 'app-logs',
  templateUrl: './logs.page.html',
  styleUrls: ['./logs.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
    IonGrid, IonRow, IonCol,
    IonSkeletonText,
    IonToolbar
  ]
})
export class LogsPage implements OnInit, OnDestroy {

  currentBlock: number = 0;
  currentTrxs: number = 0;
  currentBlockTimestamp: number = 0;
  loginEvents: any[] = [];
  loadingEvents: boolean = false;

  emptyRows: Array<any> = Array(5).fill(null);

  constructor(
    private loadingController: LoadingController,
    private rpcService: RpcService,
  ) { }

  ngOnInit() {
  }

  ngOnDestroy() {
    this.rpcService.stopListening();
  }

  async ionViewWillEnter() {
    this.loadingEvents = true;
    const loading = await this.loadingController.create({
      message: 'Loading events...'
    })
    await loading.present();

    // Initialize current block
    try {
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
      // console.log(`New block detected: ${blockNumber}, timestamp: ${timestamp}`);
    });

    await this.getLogs();
    this.loadingEvents = false;
    this.loadingController.dismiss();
  }

  async ionViewWillLeave() {
    this.rpcService.stopListening();
  }

  async getLogs() {
    // Get all historical events-
    const allEvents = await this.rpcService.getAllContractEvents();
    // console.log('Control events:', allEvents.controlEvents);
    this.loginEvents = allEvents;
    // console.log('Login events:', allEvents);

    // Get events from last 1000 blocks
    // const currentBlock = await this.rpcService.rpcProvider.getBlockNumber();
    // const recentEvents = await this.rpcService.getControlEvents(currentBlock - 1000, 'latest');

    // // Listen to real-time login events
    // this.rpcService.listenToLoginsEvents((event) => {
    //   console.log('New login event:', event.account, event.action);
    // });

    // // Stop listening when component is destroyed
    // await this.rpcService.stopListening();
  }
}
