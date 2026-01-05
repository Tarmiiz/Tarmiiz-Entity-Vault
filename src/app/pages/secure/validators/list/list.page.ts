import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';

import { Validator } from '../../../../shared/models/data.model';

import { ModalValidatorAddService } from '../modals/modal-validator-add/modal-validator-add.service';

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
  private ValidatorAddService = inject(ModalValidatorAddService);

  loadingValidators: boolean = false;

  validatorsCount = 0
  validators = signal<Validator[]>([]);
  validatorsSearchTerm = signal('');

  constructor() {}

  ngOnInit() {}


  async ionViewWillEnter() {
    this.validators.set([]);
    this.validatorsCount = 0;
  }  

  async ionViewDidEnter() {
    this.loadingValidators = true;
    await this.listValidators();
    this.loadingValidators = false;
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

  async listValidators() {
    this.loadingService.show('Loading data...');
    const result = await this.rpcService.validatorsListAll(1, 10);
    // console.log('validators', result);
    if(result.result) {
      this.validatorsCount = result.result.count;
      this.validators.set(result.result.validators);
    }
    else {
      console.log(result.error);
    }
    this.loadingService.hide();
  }  

  viewDetails(validator: Validator) {
    this.router.navigate(['/authorized/ckyc/validators/details/' + validator.address]);
  }

  filteredValidators = computed(() => {
    const term = this.validatorsSearchTerm().toLowerCase();
    if (!term) return this.validators();
    return this.validators().filter(
      c => c.name.toLowerCase().includes(term) || 
      c.email.toLowerCase().includes(term) || 
      c.mobile.toLowerCase().includes(term)
    );
  });  

  onValidatorsSearch(event: Event) {
    this.validatorsSearchTerm.set((event.target as HTMLInputElement).value);
  }  

  async openAddModal() {
    // const result = await this.ValidatorAddService.show();
    // if (result) {
    //   this.loadingService.show('Adding validator...');
    //   try {
    //     const name = result.name;
    //     const data = {
    //       email: result.email,
    //       mobile: result.mobile
    //     };
    //     await this.rpcService.ValidatorAdd(name, JSON.stringify(data));
    //     await this.listValidators();
    //   } catch (error) {
    //     console.error('Failed to add validator', error);
    //   } finally {
    //     this.loadingService.hide();
    //   }
    // }
  }

}
