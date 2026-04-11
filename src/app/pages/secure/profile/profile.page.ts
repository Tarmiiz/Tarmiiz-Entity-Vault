import { Component, inject, OnInit, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { ApiService } from '../../../shared/services/api.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';

import { Entity } from '../../../shared/models/data.model';

import { ModalProfileOperatorEditService } from './modal-profile-operator-edit/modal-profile-operator-edit.service';
import { ModalProfileOperatorEditComponent } from "./modal-profile-operator-edit/modal-profile-operator-edit.component";
import { ModalProfileMetadataEditService } from './modal-profile-metadata-edit/modal-profile-metadata-edit.service';
import { ModalProfileMetadataEditComponent } from './modal-profile-metadata-edit/modal-profile-metadata-edit.component';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    HeaderComponent,
    ModalProfileOperatorEditComponent,
    ModalProfileMetadataEditComponent
]
})
export class ProfilePage implements OnInit {
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private profileOperatorEditService = inject(ModalProfileOperatorEditService);
  private metadataEditService = inject(ModalProfileMetadataEditService);

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

  async openEditMetadataModal() {
    const current = this.info();
    if (!current) return;

    const result = await this.metadataEditService.show({
      email:   current.email   ?? '',
      mobile:  current.mobile  ?? '',
      website: current.website ?? '',
    });
    if (!result) return;

    try {
      this.loadingService.show('Updating details...');
      await new Promise(resolve => setTimeout(resolve, 0));
      await this.apiService.vaultUpdateEntityMetadata(result);
      await this.getInfo();
    } catch (error) {
      console.error('Failed to update details', error);
      this.alertService.show('Update Failed', 'There was an error updating the entity details.');
    } finally {
      this.loadingService.hide();
    }
  }

  async openChangeApiModal() {
    const currentApi = this.api();

    const result = await this.profileOperatorEditService.show('API', currentApi);
    if (!result) return;

    try {
      this.loadingService.show('Updating API address...');
      await new Promise(resolve => setTimeout(resolve, 0));
      await this.apiService.vaultSetExternalContract('api', result.address);
      await this.getApi();
    } catch (error) {
      console.error('Failed to update api', error);
      this.alertService.show('Update Failed', 'There was an error updating the API address.');
    } finally {
      this.loadingService.hide();
    }
  }

}
