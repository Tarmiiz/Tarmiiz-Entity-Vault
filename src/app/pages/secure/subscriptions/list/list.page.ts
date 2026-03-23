import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';

import { Subscription } from '../../../../shared/models/data.model';

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

  loadingServices: boolean = false;

  subscriptionsCount = 0
  subscriptions = signal<Subscription[]>([]);

  filterService = signal<string>('');
  filterState = signal<string>('');

  uniqueServices = computed(() =>
    [...new Map(this.subscriptions().map(s => [s.service, s.serviceName])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  constructor() {}

  ngOnInit() {}


  async ionViewWillEnter() {
    this.subscriptions.set([]);
    this.subscriptionsCount = 0;
  }  

  async ionViewDidEnter() {
    this.loadingServices = true;
    await this.listSubscriptions();
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

  async listSubscriptions() {
    this.loadingService.show('Loading data...');
    const result = await this.rpcService.subscriptionsListAllByEntity(1, 1000);
    if(result.result) {
      this.subscriptionsCount = result.result.count;
      this.subscriptions.set(result.result.subscriptions);
      // console.log('services', this.subscriptions());
    }
    else {
      console.log(result.error);
    }
    this.loadingService.hide();
  }  

  viewDetails(subscription: Subscription) {
    this.router.navigate(['/authorized/subscriptions/details/' + subscription.subscription]);
  }

  filteredSubscriptions = computed(() => {
    const service = this.filterService();
    const state = this.filterState();
    return this.subscriptions().filter(s =>
      (!service || s.service === service) &&
      (!state || String(s.state) === state)
    );
  });

  clearFilters() {
    this.filterService.set('');
    this.filterState.set('');
  }

}
