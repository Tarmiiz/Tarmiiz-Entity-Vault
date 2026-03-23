import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { ModalAssetAddService } from '../modals/modal-asset-add/modal-asset-add.service';
import { ModalAssetAddComponent } from '../modals/modal-asset-add/modal-asset-add.component';

import { Asset } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    ModalAssetAddComponent,
  ]
})
export class ListPage implements OnInit {
  private rpcService = inject(RpcService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private assetAddService = inject(ModalAssetAddService);

  loadingData: boolean = false;

  assetsCount = 0;
  assets = signal<Asset[]>([]);

  filterType = signal<string>('');
  filterState = signal<string>('');

  uniqueTypes = computed(() =>
    [...new Set(this.assets().map(a => a.assetTypeName).filter(Boolean))].sort()
  );

  filteredAssets = computed(() => {
    const type = this.filterType();
    const state = this.filterState();
    return this.assets().filter(a =>
      (!type || a.assetTypeName === type) &&
      (!state || String(a.state) === state)
    );
  });

  clearFilters() {
    this.filterType.set('');
    this.filterState.set('');
  }

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
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  async listAssets() {
    this.loadingService.show('Loading data...');
    this.assets.set([]);
    const result = await this.rpcService.assetsListOwn(1, 10);
    if (result.result) {
      this.assetsCount = result.result.count;
      this.assets.set(result.result.assets);
    } else {
      console.log(result.error);
    }
    this.loadingService.hide();
  }

  async openAddModal() {
    const data = await this.assetAddService.show();
    if (!data) return;

    this.loadingService.show('Creating asset...');
    try {
      const metadata = JSON.stringify({ description: data.description });
      const result = await this.rpcService.assetCreate(
        data.owner,
        data.service,
        data.issuer,
        data.manager,
        data.name,
        data.symbol,
        metadata,
        data.currency,
        data.regulator
      );
      if (result.success) {
        await this.listAssets();
      } else {
        this.alertService.show('Error', 'Failed to create asset.');
      }
    } catch (error) {
      this.alertService.show('Error', 'An unexpected error occurred.');
    } finally {
      this.loadingService.hide();
    }
  }

  viewDetails(asset: Asset) {
    this.router.navigate(['/authorized/assets/details/' + asset.address]);
  }
}
