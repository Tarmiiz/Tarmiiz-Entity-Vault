import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';

import { Asset } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
  ]
})
export class ListPage implements OnInit {
  private rpcService = inject(RpcService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);

  loadingData: boolean = false;
  showAllAssets = signal(false);

  assetsCount = 0
  assets = signal<Asset[]>([]);
  assetsSearchTerm = signal('');

  constructor() {}

  ngOnInit() {}

  async ionViewWillEnter() {
    this.assets.set([]);
    this.assetsCount = 0;
  }  

  async ionViewDidEnter() {
    this.loadingData = true;
    await this.listAssets();
    this.loadingData = false;
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

  async onToggleChange(event: Event) {
    const checkbox = event.target as HTMLInputElement;
    this.showAllAssets.set(checkbox.checked);
    await this.listAssets();
  } 

  async listAssets() {
    this.loadingService.show('Loading data...');
    this.assets.set([]);
    const result = this.showAllAssets() ? await this.rpcService.assetsListByCountry(1, 10) : await this.rpcService.assetsListByRegulator(1, 10);
    if(result.result) {
      this.assetsCount = result.result.count;
      this.assets.set(result.result.assets);
      // console.log('assets', this.assets());
    }
    else {
      console.log(result.error);
    }
    this.loadingService.hide();
  }  

  viewDetails(asset: Asset) {
    this.router.navigate(['/authorized/assets/details/' + asset.address]);
  }

  filteredAssets = computed(() => {
    const term = this.assetsSearchTerm().toLowerCase();
    if (!term) return this.assets();
    return this.assets().filter(
      c => c.name.toLowerCase().includes(term) || 
      c.symbol.toLowerCase().includes(term) || 
      c.issuer.toLowerCase().includes(term) ||
      c.manager.toLowerCase().includes(term)
    );
  });  

  onAssetsSearch(event: Event) {
    this.assetsSearchTerm.set((event.target as HTMLInputElement).value);
  }  

  async openAddModal() {
    // const result = await this.ckycServiceAddService.show();
    // if (result) {
    //   this.loadingService.show('Adding service...');
    //   try {
    //     const name = result.name;
    //     const data = {
    //       email: result.email,
    //       mobile: result.mobile
    //     };
    //     await this.rpcService.cKYCServiceAdd(name, JSON.stringify(data), 1);
    //     await this.listAssets();
    //   } catch (error) {
    //     console.error('Failed to add service', error);
    //   } finally {
    //     this.loadingService.hide();
    //   }
    // }
  }

}
