import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { Asset, Entity, Service, Subscription } from '../../../../shared/models/data.model';
import { ModalEntityStateService } from '../modals/modal-entity-state/modal-entity-state.service';
import { ModalEntityStateComponent } from "../modals/modal-entity-state/modal-entity-state.component";
import { ModalEntityEditService } from '../modals/modal-entity-edit/modal-entity-edit.service';
import { ModalEntityEditComponent } from "../modals/modal-entity-edit/modal-entity-edit.component";

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
    ModalEntityEditComponent,
    ModalEntityStateComponent
]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private rpcService = inject(RpcService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private entityEditService = inject(ModalEntityEditService);
  private serviceStateService = inject(ModalEntityStateService);

  activeTab = signal<'info' | 'services' | 'assets' | 'actions'>('info');

  loadingData: boolean = false;

  entityAddress = '';
  entity = signal<Entity | undefined>(undefined);
  subscriptions = signal<Subscription[]>([]);
  services = signal<Service[]>([]);
  assets = signal<Asset[]>([]);
  isOwn = false;

  constructor() { 
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.entityAddress = address;
    }    
  }

  async ngOnInit() {}
  
  async ionViewWillEnter() {
    await this.getEntityDetails();
    this.isOwn = this.entity()?.regulator === environment.regulatorAddress;
  }

  setTab(tab: 'info' | 'services' | 'assets' | 'actions') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getEntityDetails();
    if (tab === 'services') this.getServices();
    if (tab === 'assets') this.getAssets();
  }   

  async getEntityDetails() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.entityInfo(this.entityAddress);
    this.entity.set(data.result?.entity);
    // console.log('service', this.entity());
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

  async getServices() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.servicesListEntity(this.entityAddress, 1, 100);
    this.services.set(data.result?.services || []);
    // console.log('assets', this.services());
    this.loadingService.hide();
  }

  viewService(service: Service) {
    this.router.navigate(['/authorized/services/details/' + service.address]);
  }  

  async getAssets() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.assetsListByIssuer(this.entityAddress, 1, 100);
    this.assets.set(data.result?.assets || []);
    // console.log('assets', this.assets());
    this.loadingService.hide();
  }

  viewAsset(asset: Asset) {
    this.router.navigate(['/authorized/assets/details/' + asset.address]);
  }
  
  async getSubscriptions() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.subscribersListByService(this.entityAddress, 1, 100);
    this.subscriptions.set(data.result?.subscriptions || []);
    console.log('subscriptions', this.subscriptions());
    this.loadingService.hide();
  }

  async openEditModal() {
    const currentService = this.entity();
    if (!currentService) return;

    const result = await this.entityEditService.show(currentService);
    if (result) {
      this.loadingService.show('Updating service...');
      try {
        // Execute updates SEQUENTIALLY instead of in parallel
        if (result.name !== currentService.name) {
          await this.rpcService.serviceChangeName(currentService.address, result.name!);
        }
        
        const dataChanged = result.email !== currentService.email || result.mobile !== currentService.mobile || result.website !== currentService.website;
        if (dataChanged) {
          await this.rpcService.serviceChangeData(currentService.address, JSON.stringify({ email: result.email!, mobile: result.mobile!, website: result.website! }));
        }

        await this.getEntityDetails();

      } catch (error) {
        console.error('Failed to update service', error);
        this.alertService.show('Update Failed', 'There was an error updating the service details.');
      } finally {
        this.loadingService.hide();
      }
    }
  }

  async openChangeStateModal(){
    const currentService = this.entity();
    if (!currentService) return;

    const newState = await this.serviceStateService.show(currentService.state);
    if (newState !== null && newState !== currentService.state) {
        this.loadingService.show('Changing state...');
        try {
            await this.rpcService.entityChangeState(currentService.address, newState);
            await this.getEntityDetails();
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
    }    
  }

  async gotoSubscriber(subscription: string) {
    this.router.navigate(['/authorized/subscriptions/details/' + subscription]);
  }  

}
