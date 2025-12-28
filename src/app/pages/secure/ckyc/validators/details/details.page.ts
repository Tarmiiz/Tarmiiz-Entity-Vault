import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";

import { RpcService } from '../../../../../shared/services/rpc.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { Service, Validator } from '../../../../../shared/models/data.model';
import { ModalValidatorEditService } from '../modals/modal-validator-edit/modal-validator-edit.service';
import { ModalValidatorEditComponent } from "../modals/modal-validator-edit/modal-validator-edit.component";
import { ModalValidatorStateService } from '../modals/modal-validator-state/modal-validator-state.service';
import { ModalValidatorStateComponent } from "../modals/modal-validator-state/modal-validator-state.component";

import { environment } from '../../../../../../environments/environment';

@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    RouterLink,
    ModalValidatorEditComponent,
    ModalValidatorStateComponent
]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private rpcService = inject(RpcService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private ValidatorEditService = inject(ModalValidatorEditService);
  private ckcyValidatorStateService = inject(ModalValidatorStateService);

  activeTab = signal<'info' | 'services' | 'identities' | 'actions'>('info');

  validatorAddress = signal<string>('');
  validator = signal<Validator | undefined>(undefined);
  services = signal<Service[]>([]);

  isOwn = false;

  constructor() { 
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.validatorAddress.set(address);
    }    
  }

  async ngOnInit() {}

  async ionViewWillEnter() {
    await this.getValidatorDetails();
    this.isOwn = this.validator()?.regulator === environment.regulatorAddress;
  }  

  setTab(tab: 'info' | 'services' | 'identities' | 'actions') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getValidatorDetails();
    if (tab === 'services') this.getServicesList();
    
  }   

  async getValidatorDetails() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.validatorInfo(this.validatorAddress());
    this.validator.set(data.result?.validator);
    // console.log('validator', this.validator());
    this.loadingService.hide();
  }

  async getServicesList() {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.validatorServicesList(this.validatorAddress(), 1, 10);
    if(data.result) this.services.set(data.result?.services);
    // console.log('services', this.services());
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
    const currentValidator = this.validator();
    if (!currentValidator) return;

    const result = await this.ValidatorEditService.show(currentValidator);
    
    if (result) {
      this.loadingService.show('Updating validator...');
      try {
        // Execute updates SEQUENTIALLY instead of in parallel
        if (result.name !== currentValidator.name) {
          await this.rpcService.validatorChangeName(currentValidator.address, result.name!);
        }
        
        const dataChanged = result.email !== currentValidator.email || result.mobile !== currentValidator.mobile;
        if (dataChanged) {
          await this.rpcService.validatorChangeData(currentValidator.address, JSON.stringify({ email: result.email!, mobile: result.mobile! }));
        }

        await this.getValidatorDetails();

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
            await this.rpcService.validatorChangeState(currentValidator.address, newState);
            await this.getValidatorDetails();
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
    }    
  }

  async viewService(service: string) {
    this.router.navigate(['/authorized/ckyc/services/details/' + service]);
  }

}
