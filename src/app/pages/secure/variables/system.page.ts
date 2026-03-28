import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { ApiService } from '../../../shared/services/api.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';

import { Country, GlobalVariable } from '../../../shared/models/data.model';


@Component({
  selector: 'app-system',
  templateUrl: './system.page.html',
  styleUrls: ['./system.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
  ]
})

export class SystemPage implements OnInit {
    private loadingService = inject(LoadingService);
    private apiService = inject(ApiService);


  activeTab = signal<'countries' | 'variables'>('countries');

  countriesSearchTerm = signal('');
  variablesSearchTerm = signal('');

  countries = signal<Country[]>([]);
  globalVariables = signal<GlobalVariable[]>([]);

  loadingData = false;
  emptyRows: Array<any> = Array(5).fill(null);

  variables: GlobalVariable[] = [];

  constructor() { }

  async ngOnInit() {
  }
  
  async ionViewDidEnter() {
    this.loadingData = true;
    this.loadingService.show('Loading data...');
    await Promise.all([this.getCountries(), this.getVariables()]);
    this.loadingData = false;
    this.loadingService.hide();
  }

  async getCountries() {
    const data = await this.apiService.vaultGetCountries();
    this.countries.set(data?.map((c: any) => ({
      countryCode: c.country_code,
      nameShort: c.name_short,
      nameFull: c.name_full,
      currencyCode: c.currency_code,
      currencyName: c.currency_name,
    })) ?? []);
  }

  async getVariables() {
    const data = await this.apiService.vaultGetGlobalVariables();
    this.globalVariables.set(data?.map((v: any) => ({
      variableId: v.variable_id,
      category: v.category,
      name: v.name,
    })) ?? []);
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
