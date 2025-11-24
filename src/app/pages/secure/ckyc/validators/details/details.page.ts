import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";

import { RpcService } from '../../../../../shared/services/rpc.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { cKYCValidator } from '../../../../../shared/models/data.model';
import { ModalcKYCValidatorEditService } from '../../../../../shared/components/modals/modal-ckyc-validator-edit/modal-ckyc-validator-edit.service';
import { ModalcKYCValidatorStateService } from '../../../../../shared/components/modals/modal-ckyc-validator-state.service';

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
  private ckycValidatorEditService = inject(ModalcKYCValidatorEditService);
  private ckcyValidatorStateService = inject(ModalcKYCValidatorStateService);

  validatorId = 0;
  validator = signal<cKYCValidator | undefined>(undefined);
  // validatorStates = signal<Map<number, string>>(new Map());

  constructor() { 
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.validatorId = +id;
    }    
  }

  async ngOnInit() {
    await this.getValidatorDetails(this.validatorId);
    // await this.getStates();
  }

  async getValidatorDetails(id: number) {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.cKYCValidatorInfo(id);
    this.validator.set(data.result?.validator);
    console.log('validator', this.validator());
    this.loadingService.hide();
  }

  // async getStates() {
  //   this.loadingService.show('Loading data...');
  //   await this.rpcService.connectGlobalVariables();
  //   const data = await this.rpcService.getGlobalVariableByCategory('cKYC Validator State');
  //   const stateMap = new Map<number, string>();
  //   data.result.forEach((state: any) => stateMap.set(state.variableId, state.name));
  //   this.validatorStates.set(stateMap);
  //   this.loadingService.hide();
  // }

  // getStateName(stateId: number | undefined): string {
  //   if (stateId === undefined) return 'Unknown';
  //   return this.validatorStates().get(stateId) || 'Unknown';
  // }

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
    const currentValidator = this.validator();
    if (!currentValidator) return;

    const result = await this.ckycValidatorEditService.show(currentValidator);
    
    if (result) {
      this.loadingService.show('Updating validator...');
      try {
        // Execute updates SEQUENTIALLY instead of in parallel
        if (result.name !== currentValidator.name) {
          await this.rpcService.cKYCValidatorChangeName(currentValidator.id, result.name!);
        }
        
        const dataChanged = result.email !== currentValidator.email || result.mobile !== currentValidator.mobile;
        if (dataChanged) {
          await this.rpcService.cKYCValidatorChangeData(currentValidator.id, JSON.stringify({ email: result.email!, mobile: result.mobile! }));
        }

        await this.getValidatorDetails(this.validatorId);

        // const updatePromises: Promise<any>[] = [];

        // if (result.name !== currentValidator.name) {
        //   updatePromises.push(this.rpcService.cKYCValidatorChangeName(currentValidator.id, result.name!));
        // }
        
        // const dataChanged = result.email !== currentValidator.email || result.mobile !== currentValidator.mobile;
        // if (dataChanged) {
        //   updatePromises.push(this.rpcService.cKYCValidatorChangeData(currentValidator.id, JSON.stringify({ email: result.email!, mobile: result.mobile! })));
        // }

        // await Promise.all(updatePromises);

        // await this.getValidatorDetails(this.validatorId);

      } catch (error) {
        console.error('Failed to update validator', error);
        this.alertService.show('Update Failed', 'There was an error updating the validator details.');
      } finally {
        this.loadingService.hide();
      }
    }
  }

  async openChangeStateModal(){
    const currentValidator = this.validator();
    if (!currentValidator) return;

    const newState = await this.ckcyValidatorStateService.show(currentValidator.state);
    if (newState !== null && newState !== currentValidator.state) {
        this.loadingService.show('Changing state...');
        try {
            await this.rpcService.cKYCValidatorChangeState(currentValidator.id, newState);
            await this.getValidatorDetails(currentValidator.id);
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
    }    
  }
}
