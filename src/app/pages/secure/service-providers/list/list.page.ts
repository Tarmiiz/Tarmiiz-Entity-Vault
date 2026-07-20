import { Component, OnInit, signal, computed, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

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
  imports: [FormsModule, HeaderComponent, ModalSpAddComponent, TranslatePipe],
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private authService = inject(AuthService);
  private spAddService = inject(ModalSpAddService);
  private translate = inject(TranslateService);

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
    this.loadingService.show(this.translate.instant('common.loadingData'));
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
    this.loadingService.show(this.translate.instant('serviceProviders.alerts.adding'));
    try {
      const res: any = await this.apiService.vaultAddServiceProvider(result.provider, result.spType);
      this.loadingService.hide();
      if (res?.error) {
        await this.alertService.show(this.translate.instant('serviceProviders.alerts.addFailedTitle'), res.error);
        return;
      }
      if (res?.requestId) {
        await this.alertService.show(this.translate.instant('serviceProviders.alerts.submittedTitle'), this.translate.instant('serviceProviders.alerts.addSubmittedMessage'));
        return;
      }
      await this.listProviders();
    } finally {
      this.loadingService.hide();
    }
  }

  async suspend(p: EntityServiceProvider) {
    // Pre-check usage so we can show the blocking services before the on-chain guard reverts.
    this.loadingService.show(this.translate.instant('serviceProviders.alerts.checkingUsage'));
    const usage = await this.apiService.vaultGetServiceProviderUsage(p.address);
    this.loadingService.hide();
    if (usage?.inUse) {
      const list = usage.services.map((s: any) => `• ${s.name || s.address}`).join('\n');
      await this.alertService.show(
        this.translate.instant('serviceProviders.alerts.cannotSuspendTitle'),
        `${this.translate.instant('serviceProviders.alerts.cannotSuspendMessage')}\n\n${list}`,
      );
      return;
    }
    const confirmed = await this.alertService.show(
      this.translate.instant('serviceProviders.alerts.suspendTitle'),
      this.translate.instant('serviceProviders.alerts.suspendMessage', { name: p.name || p.address }),
      this.translate.instant('serviceProviders.actions.suspend'),
    );
    if (!confirmed) return;
    await this.applyState(p, 2);
  }

  async reactivate(p: EntityServiceProvider) {
    const confirmed = await this.alertService.show(
      this.translate.instant('serviceProviders.alerts.reactivateTitle'),
      this.translate.instant('serviceProviders.alerts.reactivateMessage', { name: p.name || p.address }),
      this.translate.instant('serviceProviders.actions.reactivate'),
    );
    if (!confirmed) return;
    await this.applyState(p, 1);
  }

  private async applyState(p: EntityServiceProvider, state: number) {
    this.loadingService.show(this.translate.instant('common.updating'));
    try {
      const res: any = await this.apiService.vaultSetServiceProviderState(p.address, state);
      this.loadingService.hide();
      if (res?.error) {
        await this.alertService.show(this.translate.instant('serviceProviders.alerts.updateFailedTitle'), res.error);
        return;
      }
      if (res?.requestId) {
        await this.alertService.show(this.translate.instant('serviceProviders.alerts.submittedTitle'), this.translate.instant('serviceProviders.alerts.updateSubmittedMessage'));
        return;
      }
      await this.listProviders();
    } finally {
      this.loadingService.hide();
    }
  }
}
