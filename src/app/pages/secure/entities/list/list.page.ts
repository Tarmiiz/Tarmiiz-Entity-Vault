import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';

import { Entity } from '../../../../shared/models/data.model';

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
  showAllEntities = signal(false);

  entitiesCount = 0
  entities = signal<Entity[]>([]);
  entitiesSearchTerm = signal('');

  constructor() {}

  ngOnInit() {}

  async ionViewWillEnter() {
    this.entities.set([]);
    this.entitiesCount = 0;
  }  

  async ionViewDidEnter() {
    this.loadingData = true;
    await this.listEntities();
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
    this.showAllEntities.set(checkbox.checked);
    await this.listEntities();
  } 

  async listEntities() {
    this.loadingService.show('Loading data...');
    this.entities.set([]);
    const result = this.showAllEntities() ? await this.rpcService.entitiesListAll(1, 10) : await this.rpcService.entitiesListOwn(1, 10);
    if(result.result) {
      this.entitiesCount = result.result.count;
      this.entities.set(result.result.entities);
      // console.log('entities', this.entities());
    }
    else {
      console.log(result.error);
    }
    this.loadingService.hide();
  }  

  viewDetails(entity: Entity) {
    this.router.navigate(['/authorized/entities/details/' + entity.address]);
  }

  filteredData = computed(() => {
    const term = this.entitiesSearchTerm().toLowerCase();
    if (!term) return this.entities();
    return this.entities().filter(
      c => c.name.toLowerCase().includes(term) || 
      c.email.toLowerCase().includes(term) || 
      c.mobile.toLowerCase().includes(term) ||
      c.address.toLowerCase().includes(term) ||
      c.regulatorName.toLowerCase().includes(term) ||
      c.stateName.toLowerCase().includes(term)
    );
  });  

  onServicesSearch(event: Event) {
    this.entitiesSearchTerm.set((event.target as HTMLInputElement).value);
  }  

}
