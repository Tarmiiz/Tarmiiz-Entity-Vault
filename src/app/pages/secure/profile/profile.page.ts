import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { RpcService } from '../../../shared/services/rpc.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';

import { Regulator } from '../../../shared/models/data.model';

import { ModalProfileOperatorEditService } from './modal-profile-operator-edit/modal-profile-operator-edit.service';
import { ModalProfileOperatorEditComponent } from "./modal-profile-operator-edit/modal-profile-operator-edit.component";

import { ModalProfileDataEditComponent } from "./modal-profile-data-edit/modal-profile-data-edit.component";
import { ModalProfileDataEditService } from './modal-profile-data-edit/modal-profile-data-edit.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    ModalProfileOperatorEditComponent,
    ModalProfileDataEditComponent
]
})

export class ProfilePage implements OnInit {
  private rpcService = inject(RpcService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private profileOperatorEditService = inject(ModalProfileOperatorEditService);
  private profileDataEditService = inject(ModalProfileDataEditService);

  activeTab = signal<'info' | 'operator' | 'api' >('info');
  info = signal<Regulator | undefined>(undefined);
  operator = signal<string>('');
  api = signal<string>('');

  constructor() { }

  async ngOnInit() {}

  async ionViewWillEnter() {
    await this.getInfo();
  }

  setTab(tab: 'info' | 'operator' | 'api' ) {
    this.activeTab.set(tab);
    if (tab === 'info') this.getInfo();
    if (tab === 'operator') this.getOperator();
    if (tab === 'api') this.getApi();
  }  

  async getInfo() {
    this.loadingService.show('Loading data...');
    const info = await this.rpcService.regulatorInfoGet();
    this.info.set(info.result!);
    this.loadingService.hide();
  }

  async openUpdateDataModal() {
    const currentData = this.info()!.data;
    if (!currentData) return;

    const result = await this.profileDataEditService.show(currentData);
    if (result) {
      this.loadingService.show('Updating data...');
      try {
        if (result !== currentData) {
          await this.rpcService.regulatorInfoSet(JSON.stringify(result));
          await this.getInfo();
        }

      } catch (error) {
        console.error('Failed to update data', error);
        this.alertService.show('Update Failed', 'There was an error updating the data details.');
      } finally {
        this.loadingService.hide();
      }
    }    
  }  

  async getOperator() {
    this.loadingService.show('Loading data...');
    const opreator = await this.rpcService.operatorGet();
    this.operator.set(opreator.result!);
    this.loadingService.hide();
  }

  async openChangeOperatorModal() {
    const currentOperator = this.operator();
    if (!currentOperator) return;

    const result = await this.profileOperatorEditService.show('Operator', currentOperator);
    if (result) {
      this.loadingService.show('Updating operator...');
      try {
        if (result.address !== currentOperator) {
          await this.rpcService.operatorSet(result.address);
          await this.getOperator();
        }
      } catch (error) {
        console.error('Failed to update operator', error);
        this.alertService.show('Update Failed', 'There was an error updating the operator details.');
      } finally {
        this.loadingService.hide();
      }
    }    
  }

  async getApi() {
    this.loadingService.show('Loading data...');
    const api = await this.rpcService.regulatorApiGet();
    this.api.set(api.result!);
       this.loadingService.hide();
  }

  async openChangeApiModal() {
    const currentApi = this.api();
    if (!currentApi) return;

    const result = await this.profileOperatorEditService.show('API', currentApi);
    if (result) {
      this.loadingService.show('Updating api...');
      try {
        if (result.address !== currentApi) {
          console.log('result', result);
          await this.rpcService.regulatorApiSet(result.address);
          await this.getApi();
        }


      } catch (error) {
        console.error('Failed to update api', error);
        this.alertService.show('Update Failed', 'There was an error updating the api details.');
      } finally {
        this.loadingService.hide();
      }
    }    
  }  

}
