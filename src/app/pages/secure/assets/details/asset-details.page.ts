import { Component, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoadingController } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import {
  IonContent,
  IonCard, IonCardContent,
  IonList, IonItem, IonLabel, IonButton,
  IonSegment, IonSegmentButton, IonSegmentView, IonSegmentContent,
  AlertController,
  IonGrid, IonRow, IonCol
} from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { Asset, AssetPrice, AssetSupplyChange } from '../../../../shared/models/data.model';

import { RpcService } from '../../../../shared/services/rpc.service';
import { RpcAssetsService } from '../../../../shared/services/rpc-assets.service';

@Component({
  selector: 'app-asset-details',
  templateUrl: './asset-details.page.html',
  styleUrls: ['./asset-details.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
    IonCard, IonCardContent,
    IonList, IonItem, IonLabel, IonButton,
    IonSegment, IonSegmentButton, IonSegmentView, IonSegmentContent,
    IonGrid, IonRow, IonCol,
  ]
})
export class AssetDetailsPage implements OnInit {
  @Input() asset!: Asset | null;

    private route = inject(ActivatedRoute);
    private loadingController = inject(LoadingController);
    private alertController = inject(AlertController);
    private rpcService = inject(RpcService);
    private rpcAssetsService = inject(RpcAssetsService);


  loading: any;
  isSuspended: string = '';
  address: string = '';

  supplyChanges: AssetSupplyChange[] = [];

  priceCurrent!: AssetPrice;
  pricesHistoryCount: number = 0;
  pricesHistory: AssetPrice[] = [];

  constructor() { }

  async showLoader() {
    this.loading = await this.loadingController.create({
      message: 'Loading data ...'
    })
    await this.loading.present();
  }

  async dismissLoader() {
    await this.loading.dismiss();
  }

  async ngOnInit() {
    this.address = this.route.snapshot.paramMap.get('address') || '';
    console.log('address', this.address);
  }
  
  async ionViewDidEnter() {
    if(this.address) {
      await this.showLoader();
      await this.getAssetInfo();
      await this.checkState();
      await this.dismissLoader();
    }
    
  }

  async getAssetInfo() {
    const info = await this.rpcAssetsService.assetInfo(this.address);
    this.asset = info.result;
    console.log('asset', this.asset);
  }

  async checkState() {
    const isSuspended = await this.rpcAssetsService.assetIsSuspended(this.asset!.address);
    if(isSuspended.error) return;
    this.isSuspended = isSuspended.result ? 'True' : 'False';    
    console.log('isSuspended', this.isSuspended);
  }

  async suspend() {

    const alert = await this.alertController.create({
      header: 'Suspend Asset',
      message: 'Do you want to suspend this asset?',
      inputs: [
        {
          name: 'suspendOption',
          type: 'radio',
          label: 'True',
          value: 'true'
        },
        {
          name: 'suspendOption',
          type: 'radio',
          label: 'False',
          value: 'false'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'OK',
          role: 'confirm',
          handler: async (data) => {
            console.log('Selected value:', data);
            const loading = await this.loadingController.create({
              message: 'Submitting request ...'
            })
            await loading.present();
        
            await this.rpcAssetsService.assetSuspend(this.address, data);
            await this.checkState();
        
            this.loadingController.dismiss();
          },
        },
      ]
    });

    await alert.present();    

  }

  async onSegmentChange(event: any) {
    const selectedSegment = event.detail.value;
    console.log('Segment changed to:', selectedSegment);

    // Add logic here to handle different segment views
    switch(selectedSegment) {
      case 'basic':
        console.log('Basic info segment selected');
        // Add logic for basic info
        break;
      case 'extra':
        console.log('Extra info segment selected');
        // Add logic for extra info
        break;
      case 'prices':
        await this.loadPriceData();
        break;
      case 'supply':
        await this.loadSupplyData();
        break;
      case 'holders':
        console.log('Holders segment selected');
        // Add logic for holders
        break;
      case 'transactions':
        console.log('Transactions segment selected');
        // Add logic for transactions
        break;
      case 'documents':
        console.log('Documents segment selected');
        // Add logic for documents
        break;
      default:
        console.log('Unknown segment selected');
    }
  }

  async loadPriceData() {
    await this.showLoader();
    const priceCurrent = await this.rpcAssetsService.assetPriceCurrent(this.address);
    if(priceCurrent.result) {
      this.priceCurrent = priceCurrent.result.price;
    }
    else {
      console.log(priceCurrent.error);
    }
    const pricesHistory = await this.rpcAssetsService.assetPriceHistory(this.address, 1, 10);
    if(pricesHistory.result) {
      this.pricesHistoryCount = pricesHistory.result.count;
      this.pricesHistory = pricesHistory.result.prices;
    }
    else {
      console.log(pricesHistory.error);
    }
    await this.dismissLoader();

  }

  async loadSupplyData() {
    await this.showLoader();
    const supplyChanges = await this.rpcAssetsService.assetSupplyChanges(this.address, 1, 10);
    if(supplyChanges.result) {
      this.supplyChanges = supplyChanges.result;
      console.log('supplyChanges', this.supplyChanges);
    }
    await this.dismissLoader();
  }

  async loadHoldersData() {}
  async loadTransactionsData() {}
  async loadDocumentsData() {}
}
