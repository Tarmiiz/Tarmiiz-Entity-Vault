import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { Asset } from '../../../../shared/models/data.model';
import { ModalAssetStateService } from '../modals/modal-asset-state/modal-asset-state.service';
import { ModalAssetStateComponent } from "../modals/modal-asset-state/modal-asset-state.component"; 

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
    ModalAssetStateComponent
  ]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private rpcService = inject(RpcService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private assetStateService = inject(ModalAssetStateService);

  activeTab = signal<'info' | 'price' | 'holders' | 'trxs' | 'actions'>('info');

  loadingData: boolean = false;

  assetAddress = '';
  asset = signal<Asset | undefined>(undefined);
  isOwn = false;

  constructor() { 
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.assetAddress = address;
    }    
  }

  async ngOnInit() {}
  
  async ionViewWillEnter() {
    await this.getAssetDetails();
    this.isOwn = this.asset()?.regulator === environment.regulatorAddress;
  }

  setTab(tab: 'info' | 'price' | 'holders' | 'trxs' | 'actions') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getAssetDetails();
    // if (tab === 'subscriptions') this.getSubscriptions();
  }   

  async getAssetDetails() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.assetInfo(this.assetAddress);
    this.asset.set(data.result?.asset);
    // console.log('asset', this.asset());
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
    const currentAsset = this.asset();
    if (!currentAsset) return;

    const newState = await this.assetStateService.show(currentAsset.state);
    if (newState !== null && newState !== currentAsset.state) {
        this.loadingService.show('Changing state...');
        try {
            const setState = newState === 2 ? false : true;
            await this.rpcService.assetChangeState(currentAsset.address, newState);
            await this.getAssetDetails();
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
    }    
  }

  async gotoLink(address: string) {
    this.router.navigate(['/authorized/ckyc/services/details/' + address]);
  }  

  async gotoSubscriber(subscription: string) {
    this.router.navigate(['/authorized/subscriptions/details/' + subscription]);
  }  

}
