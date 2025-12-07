import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';

import { RpcService } from '../../../../shared/services/rpc.service';
import { ApiService } from '../../../../shared/services/api.service';

import { cKYCIdentity } from '../../../../shared/models/data.model';

interface StatCard {
  title: string;
  value: number;
  icon: string;
}

interface Asset {
  issuer: string;
  name: string;
  symbol: string;
  supply: number;
  value: number;
}

interface CreditCard {
  title: string;
  value: number;
  icon: string;
}

interface Credit {
  time: number;
  type: string
  value: number;
}

interface TrxCard {
  title: string;
  value: number;
  icon: string;
}

interface Transaction {
  time: number;
  ref: string;
  symbol: string;
  type: string
  volume: number;
  value: number;
}


@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
    RouterLink
  ]
})
export class UserDetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private rpcService = inject(RpcService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private apiService = inject(ApiService);

  activeTab = signal<'overview' | 'info' | 'holdings' | 'credit' | 'trxs' | 'actions' >('overview');

  uniqueIdHash = '';
  identity = signal<cKYCIdentity | null>(null);
  metadata = signal<any | null>(null);
  idFront: string = '';
  idBack: string = '';

    // Lightbox properties
  showLightbox: boolean = false;
  lightboxImage: string = '';

  stats = signal<StatCard[]>([
    { title: 'Total Assets', value: 4, icon: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9A2.25 2.25 0 0018.75 6.75h-1.5a3 3 0 00-3-3h-3a3 3 0 00-3 3H7.5A2.25 2.25 0 005.25 9v3' },
    { title: 'Total Volume', value: 17250, icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21v-1a6 6 0 00-5.197-5.932' },
    { title: 'Total Value', value: 8300, icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.663M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z' }
  ]);

  assets = signal<Asset[]>([
    { issuer: 'BM', name: 'Digital Egyptian Pound', symbol: 'EGP-D', supply: 15000, value: 2300 },
    { issuer: 'MNGM', name: 'Gold-Backed Token', symbol: 'GOLD', supply: 1500, value: 5000 },
    { issuer: 'CBE', name: 'Treasury Bond 2028', symbol: 'TB-28', supply: 500, value: 750 },
    { issuer: 'NAWY', name: 'Real Estate Token', symbol: 'RET-01', supply: 250, value: 250 },
  ]);

  creditSummary = signal<CreditCard[]>([
    { title: 'Total Credit', value: 25300, icon: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9A2.25 2.25 0 0018.75 6.75h-1.5a3 3 0 00-3-3h-3a3 3 0 00-3 3H7.5A2.25 2.25 0 005.25 9v3' },
    { title: 'Total Deposits', value: 27300, icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21v-1a6 6 0 00-5.197-5.932' },
    { title: 'Total Transactions', value: 8300, icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.663M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z' }
  ]);

  creditTrx = signal<Credit[]>([
    { time: 1765101612, type: 'Deposit', value: 2300 },
    { time: 1765001612, type: 'Buy', value: 5000 },
    { time: 1764101612, type: 'Sell', value: 750 },
    { time: 1762101612, type: 'Deposit', value: 25000 },
  ]);

  trxSummary = signal<TrxCard[]>([
    { title: 'Total Transactions', value: 23, icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.663M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z' },
    { title: 'Total Buy', value: 25300, icon: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9A2.25 2.25 0 0018.75 6.75h-1.5a3 3 0 00-3-3h-3a3 3 0 00-3 3H7.5A2.25 2.25 0 005.25 9v3' },
    { title: 'Total Sell', value: 7300, icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21v-1a6 6 0 00-5.197-5.932' },
  ]);

  trxDetails = signal<Transaction[]>([
    { time: 1765101612, ref: 'TX-1217511', symbol: 'EGP-D', type: 'Sell', volume: 100, value: 2300 },
    { time: 1765001612, ref: 'TX-1217251', symbol: 'EGP-D', type: 'Buy', volume: 350, value: 5000 },
    { time: 1764101612, ref: 'TX-1215510', symbol: 'EGP-D', type: 'Sell', volume: 100, value: 750 },
    { time: 1762101612, ref: 'TX-1214502', symbol: 'EGP-D', type: 'Buy', volume: 250, value: 25000 },
  ]);

  recentActivity = signal<any[]>([
    { type: 'Transfer', icon: 'arrow-up', color: 'red', description: 'to EGY-67890', value: -500, time: new Date(Date.now() - 3600000) },
    { type: 'Credit', icon: 'plus', color: 'green', description: 'Loan Disbursed', value: 20000, time: new Date(Date.now() - 86400000) },
    { type: 'Purchase', icon: 'shopping-cart', color: 'blue', description: '0.1 GOLD', value: -103.22, time: new Date(Date.now() - 93600000) },
    { type: 'Deposit', icon: 'arrow-down', color: 'green', description: 'from NBE', value: 1500, time: new Date(Date.now() - 172800000) },
  ]);

  constructor() { 
    const uid = this.route.snapshot.paramMap.get('uid');
    console.log('uid', uid);
    if (uid) {
      this.uniqueIdHash = uid;
    }    
  }

  async ngOnInit() {}
  
  async ionViewWillEnter() {
    await this.getIdenityDetails(this.uniqueIdHash);
  }

  setTab(tab: 'overview' | 'info' | 'holdings' | 'credit' | 'trxs' | 'actions') {
    this.activeTab.set(tab);
    // if (tab === 'info') {
    //   this.getIdenityDetails(this.uniqueIdHash);
    // }
  }  

  async getIdenityDetails(uid: string) {
    this.loadingService.show('Loading data...');
    const data = await this.rpcService.cKYCIdentityLookupByUID(uid);
    this.identity.set(data.result);
    // console.log('identity', this.identity());
    const metadataCID = this.identity()?.metadata || '';
    if (metadataCID) {
      this.metadata.set(await this.apiService.ipfsFetchDataMeta(metadataCID));

      // get id type name
      const idType = this.metadata()?.idType || 0;
      await this.rpcService.connectGlobalVariables();
      const idTypeResult = await this.rpcService.getGlobalVariableByCategory('ID Type - Individual');      
      let idTypeName = 'Unknown';
      if (idTypeResult.result) {
        const idTypeVariable = idTypeResult.result.find((v: any) => v.variableId === idType);
        idTypeName = idTypeVariable?.name || 'Unknown';
      } 
      this.metadata.set({...this.metadata(), idTypeName});

      // get id front and back images
      const idFrontCID = this.metadata()?.idFrontCID || '';
      const idBackCID = this.metadata()?.idBackCID || '';
      if (idFrontCID) {
        const img = await this.apiService.ipfsFetchDataImage(idFrontCID);
        if (img) {
          this.idFront = img.src;  // Extract the src from HTMLImageElement
        }
      }
      if (idBackCID) {
        const img = await this.apiService.ipfsFetchDataImage(idBackCID);
        if (img) {
          this.idBack = img.src;  // Extract the src from HTMLImageElement
        }
      } 
      // console.log('metadata', this.metadata());
    }
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

  // Lightbox methods
  openLightbox(imageSrc: string) {
    this.lightboxImage = imageSrc;
    this.showLightbox = true;
  }

  closeLightbox() {
    this.showLightbox = false;
    this.lightboxImage = '';
  }  

}
