import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent, 
} from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';

import { Country, GlobalVariable } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-system',
  templateUrl: './system.page.html',
  styleUrls: ['./system.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
  ]
})

export class SystemPage implements OnInit {
  activeTab = signal<'countries' | 'variables'>('countries');

  countriesSearchTerm = signal('');
  variablesSearchTerm = signal('');

  countries = signal<Country[]>([]);
  globalVariables = signal<GlobalVariable[]>([]);

  loadingData = false;
  emptyRows: Array<any> = Array(5).fill(null);

  variables: GlobalVariable[] = [];

  constructor(
    private loadingService: LoadingService,
    private rpcService: RpcService,
  ) { }

  async ngOnInit() {
  }
  
  async ionViewDidEnter() {
    this.loadingData = true;
    this.loadingService.show('Loading data...');

    await this.rpcService.connectGlobalVariables();
    await this.getCountries();
    await this.getVariables();
    this.loadingData = false;
    this.loadingService.hide();
  }

  async getCountries() {
    const data = await this.rpcService.getCountriesList();
    if(data.result) {
      this.countries.set(data.result);
    }
    else {
      this.countries.set([]);
    }
  }

  async getVariables() {
    const data = await this.rpcService.getGlobalVariables();
    if(data.result) {
      this.globalVariables.set(data.result);
    }
    else {
      this.globalVariables.set([]);
    }
  }

  filteredCountries = computed(() => {
    const term = this.countriesSearchTerm().toLowerCase();
    if (!term) return this.countries();
    return this.countries().filter(c => c.nameShort.toLowerCase().includes(term) || c.nameFull.toLowerCase().includes(term));
  });

  filteredVariables = computed(() => {
    const term = this.variablesSearchTerm().toLowerCase();
    if (!term) return this.globalVariables();
    return this.globalVariables().filter(v => v.category.toLowerCase().includes(term));
  });
  
  setTab(tab: 'countries' | 'variables') {
    this.activeTab.set(tab);
  }

  onCountriesSearch(event: Event) {
    this.countriesSearchTerm.set((event.target as HTMLInputElement).value);
  }

  onVariablesSearch(event: Event) {
    this.variablesSearchTerm.set((event.target as HTMLInputElement).value);
  }

}
