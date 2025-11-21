import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import {
  IonContent,
  IonGrid, IonRow, IonCol,
  IonSkeletonText, IonSearchbar,
} from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';

import { Asset } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-assets',
  templateUrl: './assets.page.html',
  styleUrls: ['./assets.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
    IonGrid, IonRow, IonCol,
    IonSkeletonText, IonSearchbar
  ]
})
export class AssetsPage implements OnInit {

  loadingAssets: boolean = false;
  assetsCount = 0;
  assets: Asset[] = [];
  emptyRows: Array<any> = Array(5).fill(null);

  constructor(
    private loadingController: LoadingController,
    private rpcService: RpcService,
    private router: Router
  ) { }

  ngOnInit() {
  }

  async ionViewWillEnter() {
    this.assets = [];
    this.assetsCount = 0;
  }

  async ionViewDidEnter() {
    this.loadingAssets = true;
    const loading = await this.loadingController.create({
      message: 'Loading data ...'
    })
    await loading.present();
    await this.rpcService.connectGlobalVariables();
    await this.rpcService.getGlobalVariables();
    await this.listAssets();
    this.loadingAssets = false;
    this.loadingController.dismiss();
  }

  async listAssets() {
    // Get all historical events-
    const result = await this.rpcService.assetsList();
    if(result.result) {
      this.assetsCount = result.result.count;
      this.assets = result.result.assets;
      // console.log(this.assetsCount);
      // console.log(this.assets);
    }
    else {
      console.log(result.error);
    }
    // const allEvents = await this.rpcService.getAllEvents();
    // console.log('Control events:', allEvents.controlEvents);
    // this.loginEvents = allEvents.loginsEvents;
    // console.log('Login events:', allEvents.loginsEvents);

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

  viewAssetDetails(asset: Asset) {
    // Navigate to asset details page with only the asset address
    // this.router.navigate(['/authorized/asset-details'], { state: { address: asset.address } });
    this.router.navigate(['/authorized/asset-details/' + asset.address]);
  }
}

