import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";

import { RpcService } from '../../../../../shared/services/rpc.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { Service } from '../../../../../shared/models/data.model';
import { ModalServiceStateService } from '../modals/modal-service-state/modal-service-state.service';
import { ModalServiceEditService } from '../modals/modal-service-edit/modal-service-edit.service';

@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
    RouterLink,
  ]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private rpcService = inject(RpcService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private ServiceEditService = inject(ModalServiceEditService);
  private ServiceStateService = inject(ModalServiceStateService);

  serviceAddress = '';
  service = signal<Service | undefined>(undefined);

  constructor() { 
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.serviceAddress = address;
    }    
  }

  async ngOnInit() {
    await this.getServiceDetails(this.serviceAddress);
    // await this.getStates();
  }

  async getServiceDetails(address: string) {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.serviceInfo(address);
    this.service.set(data.result?.service);
    console.log('service', this.service());
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

  async openEditModal() {
    const currentService = this.service();
    if (!currentService) return;

    const result = await this.ServiceEditService.show(currentService);
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

        await this.getServiceDetails(this.serviceAddress);

      } catch (error) {
        console.error('Failed to update service', error);
        this.alertService.show('Update Failed', 'There was an error updating the service details.');
      } finally {
        this.loadingService.hide();
      }
    }
  }

  async openChangeStateModal(){
    const currentService = this.service();
    if (!currentService) return;

    const newState = await this.ServiceStateService.show(currentService.state);
    if (newState !== null && newState !== currentService.state) {
        this.loadingService.show('Changing state...');
        try {
            await this.rpcService.serviceChangeState(currentService.address, newState);
            await this.getServiceDetails(currentService.address);
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
    }    
  }
}
