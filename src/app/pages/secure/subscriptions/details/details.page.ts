import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { Service, Subscription } from '../../../../shared/models/data.model';
import { ModalSubscriptionStateService } from '../modals/modal-subscription-state/modal-subscription-state.service';
import { ModalSubscriptionStateComponent } from "../modals/modal-subscription-state/modal-subscription-state.component";

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
    ModalSubscriptionStateComponent
]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private rpcService = inject(RpcService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private subscriptionStateService = inject(ModalSubscriptionStateService);

  activeTab = signal<'info' | 'trxs' | 'actions'>('info');

  loadingData: boolean = false;

  subscriptionAddress = '';
  subscription = signal<Subscription | undefined>(undefined);
  isOwn = false;

  constructor() { 
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.subscriptionAddress = address;
    }    
  }

  async ngOnInit() {}
  
  async ionViewWillEnter() {
    await this.getSubscriptionDetails();
    this.isOwn = this.subscription()?.regulator === environment.regulatorAddress;
  }

  setTab(tab: 'info' | 'trxs' | 'actions') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getSubscriptionDetails();
  }   

  async getSubscriptionDetails() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.subscriptionInfo(this.subscriptionAddress);
    // console.log('service', data.result);
    if(data.result) this.subscription.set(data.result);
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
    const currentService = this.subscription();
    if (!currentService) return;

    const newState = await this.subscriptionStateService.show(currentService.state);
    if (newState !== null && newState !== currentService.state) {
        this.loadingService.show('Changing state...');
        try {
            await this.rpcService.serviceChangeState(currentService.subscription, newState);
            await this.getSubscriptionDetails();
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
    }    
  }

  async gotoValidator(validator: string) {
    this.router.navigate(['/authorized/ckyc/validators/details/' + validator]);
  }  

  async gotoService(service: string) {
    this.router.navigate(['/authorized/ckyc/services/details/' + service]);
  }  

  async gotoIdentity(subscriber: string) {
    this.router.navigate(['/authorized/identities/details/' + subscriber]);
  }  

}
