import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { ApiService } from '../../../shared/services/api.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';

import { Entity } from '../../../shared/models/data.model';

import { ModalProfileOperatorEditService } from './modal-profile-operator-edit/modal-profile-operator-edit.service';
import { ModalProfileOperatorEditComponent } from "./modal-profile-operator-edit/modal-profile-operator-edit.component";

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    ModalProfileOperatorEditComponent,
  ]
})
export class ProfilePage implements OnInit {
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private profileOperatorEditService = inject(ModalProfileOperatorEditService);

  activeTab = signal<'info' | 'api'>('info');
  info = signal<Entity | undefined>(undefined);
  api = signal<string>('');

  constructor() { }

  async ngOnInit() {}

  async ionViewWillEnter() {
    await this.getInfo();
  }

  setTab(tab: 'info' | 'api') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getInfo();
    if (tab === 'api') this.getApi();
  }

  async getInfo() {
    this.loadingService.show('Loading data...');
    const info = await this.apiService.vaultGetEntityInfo();
    this.info.set(info ?? undefined);
    this.loadingService.hide();
  }

  async getApi() {
    this.loadingService.show('Loading data...');
    const api = await this.apiService.vaultGetExternalContract('api');
    this.api.set(api ?? '');
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
          await this.apiService.vaultSetExternalContract('api', result.address);
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
