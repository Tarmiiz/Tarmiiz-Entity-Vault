import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';

import { Service } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
  ]
})
export class ListPage implements OnInit {
  private rpcService = inject(RpcService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);

  loadingServices: boolean = false;

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

  async listServices() {
    this.loadingService.show('Loading data...');
    const result = await this.rpcService.servicesListOwn(1, 10);
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

  viewDetails(service: Service) {
    this.router.navigate(['/authorized/ckyc/services/details/' + service.address]);
  }

  filteredServices = computed(() => {
    const term = this.servicesSearchTerm().toLowerCase();
    if (!term) return this.services();
    return this.services().filter(
      c => c.name.toLowerCase().includes(term) || 
      c.email.toLowerCase().includes(term) || 
      c.mobile.toLowerCase().includes(term)
    );
  });  

  onServicesSearch(event: Event) {
    this.servicesSearchTerm.set((event.target as HTMLInputElement).value);
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
    //     await this.listServices();
    //   } catch (error) {
    //     console.error('Failed to add service', error);
    //   } finally {
    //     this.loadingService.hide();
    //   }
    // }
  }

}
