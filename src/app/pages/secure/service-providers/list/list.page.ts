import { Component, OnInit, signal, computed, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';

import { HeaderComponent } from '../../../../shared/components/header/header.component';

import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { AuthService } from '../../../../shared/services/auth.service';

import { EntityServiceProvider, User } from '../../../../shared/models/data.model';

import { ModalSpAddComponent } from '../modals/modal-sp-add/modal-sp-add.component';
import { ModalSpAddService } from '../modals/modal-sp-add/modal-sp-add.service';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, ModalSpAddComponent],
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private authService = inject(AuthService);
  private spAddService = inject(ModalSpAddService);

  userInfo!: User;
  loadingData = false;

  providers = signal<EntityServiceProvider[]>([]);

  filterSearch = signal('');
  filterType  = signal<string>('');
  filterState = signal<string>('');

  get entityActive() { return this.authService.entityActive(); }

  constructor() {}

  ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.providers.set([]);
  }

  async ionViewDidEnter() {
    this.loadingData = true;
    await this.listProviders();
    this.loadingData = false;
  }

  getStateClass(stateId: number | undefined): string {
    switch (stateId) {
      case 1: return 'bg-green-100 text-green-800';   // Active
      case 2: return 'bg-orange-100 text-orange-800'; // Suspended
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  async listProviders() {
    this.loadingService.show('Loading data...');
    const result = await this.apiService.vaultGetServiceProviders();
    if (result) {
      this.providers.set((result.providers ?? []).map((p: any) => new EntityServiceProvider(
        p.address,
        p.spType,
        p.spTypeName,
        p.name,
        p.level,
        p.regulator,
        p.state,
        p.stateName,
        p.updatedAt,
      )));
    }
    this.loadingService.hide();
  }

  filteredProviders = computed(() => {
    const term  = this.filterSearch().toLowerCase();
    const type  = this.filterType();
    const state = this.filterState();
    return this.providers().filter(p => {
      if (type  && String(p.spType) !== type)  return false;
      if (state && String(p.state)  !== state) return false;
      if (term && !p.name.toLowerCase().includes(term) &&
                  !p.address.toLowerCase().includes(term) &&
                  !(p.spTypeName?.toLowerCase().includes(term))) return false;
      return true;
    });
  });

  clearFilters() {
    this.filterSearch.set('');
    this.filterType.set('');
    this.filterState.set('');
  }

  async openAddModal() {
    const existing = this.providers().map(p => p.address);
    const result = await this.spAddService.show(existing);
    if (!result) return;
    this.loadingService.show('Adding service provider...');
    try {
      const res: any = await this.apiService.vaultAddServiceProvider(result.provider, result.spType);
      this.loadingService.hide();
      if (res?.error) {
        await this.alertService.show('Could not add', res.error);
        return;
      }
      if (res?.requestId) {
        await this.alertService.show('Submitted for approval', 'The request to add this service provider was submitted for approval.');
        return;
      }
      await this.listProviders();
    } finally {
      this.loadingService.hide();
    }
  }

  async suspend(p: EntityServiceProvider) {
    // Pre-check usage so we can show the blocking services before the on-chain guard reverts.
    this.loadingService.show('Checking usage...');
    const usage = await this.apiService.vaultGetServiceProviderUsage(p.address);
    this.loadingService.hide();
    if (usage?.inUse) {
      const list = usage.services.map((s: any) => `• ${s.name || s.address}`).join('\n');
      await this.alertService.show(
        'Cannot suspend — in use',
        `This service provider is used by the following service(s). Reassign them first:\n\n${list}`,
      );
      return;
    }
    const confirmed = await this.alertService.show(
      'Suspend service provider',
      `Suspend ${p.name || p.address}? Existing services keep working; new services won't be able to select it.`,
      'Suspend',
    );
    if (!confirmed) return;
    await this.applyState(p, 2);
  }

  async reactivate(p: EntityServiceProvider) {
    const confirmed = await this.alertService.show(
      'Re-activate service provider',
      `Re-activate ${p.name || p.address}? Services will be able to select it again.`,
      'Re-activate',
    );
    if (!confirmed) return;
    await this.applyState(p, 1);
  }

  private async applyState(p: EntityServiceProvider, state: number) {
    this.loadingService.show('Updating...');
    try {
      const res: any = await this.apiService.vaultSetServiceProviderState(p.address, state);
      this.loadingService.hide();
      if (res?.error) {
        await this.alertService.show('Could not update', res.error);
        return;
      }
      if (res?.requestId) {
        await this.alertService.show('Submitted for approval', 'The request was submitted for approval.');
        return;
      }
      await this.listProviders();
    } finally {
      this.loadingService.hide();
    }
  }
}
