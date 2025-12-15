import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { RpcService } from '../../../../shared/services/rpc.service';
import { RpcCKYCService } from '../../../../shared/services/rpc-ckyc.service';
import { CryptoService } from '../../../../shared/services/crypto.service';

import { cKYCIdentity } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, ReactiveFormsModule,
    HeaderComponent
  ]
})
export class UsersPage implements OnInit {
  private router = inject(Router);
  private rpcService = inject(RpcService);
  private rpcCKYCService = inject(RpcCKYCService);
  private cryptoService = inject(CryptoService);
  private loadingService = inject(LoadingService);
  private fb: FormBuilder = inject(FormBuilder);

  loadingData: boolean = false;

  identitiesCount = 0
  identities = signal<cKYCIdentity[]>([]);

  searchResults = signal<cKYCIdentity|null>(null);
  searchPerformed = signal(false);
  isSearchExpanded = signal(false);

  searchForm = this.fb.group({
    searchType: ['emailMobile'],
    searchTerm: [''],
  });

  constructor() {}

  ngOnInit() {}

  async ionViewWillEnter() {
    this.identities.set([]);
    this.identitiesCount = 0;
  }  

  async ionViewDidEnter() {
    this.loadingData = true;
    await this.listIdentities();
    this.loadingData = false;
  }  

  async listIdentities() {
    this.loadingService.show('Loading data...');
    const result = await this.rpcCKYCService.cKYCIdentitiesList(1, 10);
    if(result.result) {
      this.identitiesCount = result.result.count;
      this.identities.set(result.result.identities);
      // console.log('validators', this.identities());
    }
    else {
      // console.log(result.error);
    }
    this.loadingService.hide();
  }

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
      if (searchType === 'emailMobile') { response = await this.rpcCKYCService.cKYCIdentityLookupByContact(searchTerm); }
      if (searchType === 'nationalId')  { 
        const uid = '1:818:1:' + searchTerm;
        const uidHash = '0x' + await this.cryptoService.shaHash(uid);
        response = await this.rpcCKYCService.cKYCIdentityLookupByUID(uidHash); 
      }
      if (searchType === 'ckycId') { response = await this.rpcCKYCService.cKYCIdentityLookupByContact(searchTerm); }
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

  viewDetails(identity: cKYCIdentity) {
    console.log('viewDetails', identity); 
    this.router.navigate(['/authorized/identities/details/' + identity.uniqueIdHash]);
    this.searchForm.reset();
  }

}
