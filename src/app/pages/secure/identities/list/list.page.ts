import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { RpcService } from '../../../../shared/services/rpc.service';
import { CryptoService } from '../../../../shared/services/crypto.service';

import { Identity, Subscription, ValidatorIdentity } from '../../../../shared/models/data.model';

interface StatCard {
  title: string;
  value: number;
  path: string;
  icon: string;
}

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    HeaderComponent
  ]
})
export class UsersPage implements OnInit {
  private router = inject(Router);
  private rpcService = inject(RpcService);
  private cryptoService = inject(CryptoService);
  private loadingService = inject(LoadingService);
  private fb: FormBuilder = inject(FormBuilder);

  loadingData: boolean = false;

  stats = signal<StatCard[]>([
    { title: 'Total Identities', value: 0, path: '/authorized/identities/list', icon: 'M15 9h3m-3 3h3m-3 3h3m-6 1c-.306-.613-.933-1-1.618-1H7.618c-.685 0-1.312.387-1.618 1M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm7 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z' },
    { title: 'Total Subscriptions', value: 0, path: '/authorized/ckyc/validators/list', icon: 'M7 6H5m2 3H5m2 3H5m2 3H5m2 3H5m11-1a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2M7 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z' }
  ]);  

  identitiesCount = 0
  identities = signal<Identity[]>([]);

  validatorIdentitiesCount = 0
  validatorIdentities = signal<string[]>([]);

  subscriptionsCount = 0
  subscriptions = signal<Subscription[]>([]);

  searchResults = signal<Identity|null>(null);
  searchPerformed = signal(false);
  isSearchExpanded = signal(false);

  searchForm = this.fb.group({
    searchType: ['emailMobile'],
    searchTerm: [''],
  });

  constructor() {}

  ngOnInit() {}

  async ionViewWillEnter() {
    this.subscriptions.set([]);
    this.subscriptionsCount = 0;
    this.identities.set([]);
    this.identitiesCount = 0;
    this.validatorIdentities.set([]);
    this.validatorIdentitiesCount = 0;
  }  

  async ionViewDidEnter() {
    this.loadingData = true;
    await this.listValidatedIdentities();
    await this.listSubscriptions();
    this.loadingData = false;
  }
  
  async listValidatedIdentities() {
    this.loadingService.show('Loading data...');
    const result = await this.rpcService.validatorsIdentitiesListOwn(1, 10);
    if(result.result) {
      this.validatorIdentitiesCount = result.result.count;
      this.validatorIdentities.set(result.result.identities);
      this.stats()[0].value = Number(result.result.count);
    }
    this.loadingService.hide();
  }  

  async listSubscriptions() {
    this.loadingService.show('Loading data...');
    const result = await this.rpcService.subscriptionsListByRegulator(1, 10);
    if(result.result) {
      this.subscriptionsCount = result.result.count;
      this.subscriptions.set(result.result.subscriptions);
      this.stats()[1].value = Number(result.result.count);
    }
    this.loadingService.hide();
  }

  // async listIdentities() {
  //   this.loadingService.show('Loading data...');
  //   const result = await this.rpcService.subscribersListAll(1, 10);
  //   if(result.result) {
  //     this.identitiesCount = result.result.count;
  //     this.identities.set(result.result.subscriptions);
  //     console.log('validators', this.identities());
  //   }
  //   else {
  //     // console.log(result.error);
  //   }
  //   this.loadingService.hide();
  // }

  async onSearch() {
    this.searchResults.set(null);
    const { searchTerm, searchType } = this.searchForm.value;
    if (!searchTerm) {
      return;
    }
    
    this.loadingService.show('Searching...');
    this.searchPerformed.set(true);
    this.isSearchExpanded.set(true);
    try {
      let response: any = null;
      if (searchType === 'emailMobile') { response = await this.rpcService.identityLookupByContact(searchTerm); }
      if (searchType === 'nationalId')  { 
        const uid = '1:818:1:' + searchTerm;
        const uidHash = '0x' + await this.cryptoService.shaHash(uid);
        response = await this.rpcService.identityLookupByUID(uidHash); 
      }
      // if (searchType === 'ckycId') { response = await this.rpcService.identityLookupByContact(searchTerm); }
      if (response.result) {
        this.searchResults.set(response.result);
      }
    } finally {
      this.loadingService.hide();
    }
  }

  toggleSearch() {
    this.isSearchExpanded.update(value => !value);
  }

  getPlaceholder(): string {
    switch (this.searchForm.get('searchType')?.value) {
      case 'nationalId':
        return 'Search by National Id';
      case 'ckycId':
        return 'Search by cKYC-ID';
      case 'emailMobile':
      default:
        return 'Search by Email or Mobile';
    }
  }  

  viewDetails(ginHash: string, subscription: string) {
    this.router.navigate(['/authorized/identities/details/' + ginHash]);
    this.searchForm.reset();
  }

  async gotoSubscriber(subscription: string) {
    this.router.navigate(['/authorized/subscriptions/details/' + subscription]);
  }  

}
