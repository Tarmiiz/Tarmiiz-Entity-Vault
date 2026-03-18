import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { ModalServiceAddService } from '../modals/modal-service-add/modal-service-add.service';
import { ModalServiceAddComponent } from '../modals/modal-service-add/modal-service-add.component';

import { Service } from '../../../../shared/models/data.model';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    ModalServiceAddComponent,
  ]
})
export class ListPage implements OnInit {
  private rpcService = inject(RpcService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private serviceAddService = inject(ModalServiceAddService);

  loadingServices: boolean = false;
  showAllServices = signal(false);

  servicesCount = 0
  services = signal<Service[]>([]);
  servicesSearchTerm = signal('');

  constructor() {}

  ngOnInit() {}

  async ionViewWillEnter() {
    this.services.set([]);
    this.servicesCount = 0;
  }  

  async ionViewDidEnter() {
    this.loadingServices = true;
    await this.listServices();
    this.loadingServices = false;
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
    this.showAllServices.set(checkbox.checked);
    await this.listServices();
  } 

  async listServices() {
    this.loadingService.show('Loading data...');
    this.services.set([]);
    const result = this.showAllServices() ? await this.rpcService.servicesListAll(1, 10) : await this.rpcService.servicesListOwn(1, 10);
    if(result.result) {
      this.servicesCount = result.result.count;
      this.services.set(result.result.services);
      // console.log('services', this.services());
    }
    else {
      console.log(result.error);
    }
    this.loadingService.hide();
  }  

  async openAddModal() {
    const data = await this.serviceAddService.show();
    if (!data) return;

    this.loadingService.show('Creating service...');
    try {
      const metadata = JSON.stringify({ description: data.description, website: data.website, email: data.email, mobile: data.mobile });
      const result = await this.rpcService.serviceCreate(
        data.name,
        metadata,
        data.verificationLevel,
        environment.countryCode,
        data.regulator
      );
      if (result.success) {
        await this.listServices();
      } else {
        this.alertService.show('Error', 'Failed to create service.');
      }
    } catch (error) {
      this.alertService.show('Error', 'An unexpected error occurred.');
    } finally {
      this.loadingService.hide();
    }
  }

  viewDetails(service: Service) {
    this.router.navigate(['/authorized/services/details/' + service.address]);
  }

  filteredServices = computed(() => {
    const term = this.servicesSearchTerm().toLowerCase();
    if (!term) return this.services();
    return this.services().filter(
      c => c.name.toLowerCase().includes(term) || 
      c.email.toLowerCase().includes(term) || 
      c.mobile.toLowerCase().includes(term) ||
      c.address.toLowerCase().includes(term) ||
      c.regulatorName.toLowerCase().includes(term) ||
      c.stateName.toLowerCase().includes(term)
    );
  });  

  onServicesSearch(event: Event) {
    this.servicesSearchTerm.set((event.target as HTMLInputElement).value);
  }  

}
