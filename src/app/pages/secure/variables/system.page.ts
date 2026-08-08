import { Component, OnInit, signal, computed, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { ApiService } from '../../../shared/services/api.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';

import { Country, GlobalVariable } from '../../../shared/models/data.model';
import { PaginatorComponent, pageSlice } from '../../../shared/components/paginator/paginator.component';


@Component({
  selector: 'app-system',
  templateUrl: './system.page.html',
  styleUrls: ['./system.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    HeaderComponent, TranslatePipe,
    PaginatorComponent,
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

  constructor() {}

  async ngOnInit() {}

  async ionViewDidEnter() {
    this.loadingData = true;
    this.loadingService.show('Loading data...');
    await Promise.all([this.getCountries(), this.getVariables()]);
    this.loadingData = false;
    this.loadingService.hide();
  }

  async getCountries() {
    const data = await this.apiService.vaultGetCountries();
    this.countries.set(data?.map((c: any) => new Country(
      c.country_id, c.name_short, c.name_full, c.alpha2_code, c.alpha3_code,
      c.currency_name, c.currency_code, c.calling_code, c.country_code
    )) ?? []);
  }

  async getVariables() {
    const data = await this.apiService.vaultGetGlobalVariables();
    this.globalVariables.set(data?.map((v: any) => new GlobalVariable(
      v.category, v.variable_id, v.name, v.visible
    )) ?? []);
  }

  /** 1-based, per frontend Standard 1.5. */
  countriesPage = signal(1);
  countriesPageSize = signal(25);
  pagedCountries = computed(() => pageSlice(this.filteredCountries(), this.countriesPage(), this.countriesPageSize()));
  filteredCountries = computed(() => {
    const term = this.countriesSearchTerm().toLowerCase();
    if (!term) return this.countries();
    return this.countries().filter(c =>
      c.nameShort.toLowerCase().includes(term) ||
      c.nameFull.toLowerCase().includes(term) ||
      c.alpha2Code.toLowerCase().includes(term) ||
      c.alpha3Code.toLowerCase().includes(term) ||
      c.currencyName.toLowerCase().includes(term) ||
      c.currencyCode.toLowerCase().includes(term)
    );
  });

  /** 1-based, per frontend Standard 1.5. */
  variablesPage = signal(1);
  variablesPageSize = signal(25);
  pagedVariables = computed(() => pageSlice(this.filteredVariables(), this.variablesPage(), this.variablesPageSize()));
  filteredVariables = computed(() => {
    const term = this.variablesSearchTerm().toLowerCase();
    if (!term) return this.globalVariables();
    return this.globalVariables().filter(v =>
      v.category.toLowerCase().includes(term) || v.name.toLowerCase().includes(term)
    );
  });

  setTab(tab: 'countries' | 'variables') {
    this.activeTab.set(tab);
  }
}
