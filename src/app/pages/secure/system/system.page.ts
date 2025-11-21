import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoadingController } from '@ionic/angular';
import { 
  IonContent, IonLabel, 
  IonGrid, IonRow, IonCol,
  IonSkeletonText, IonSearchbar,  
  IonSegment, IonSegmentButton, IonSegmentView, IonSegmentContent,
} from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { RpcService } from '../../../shared/services/rpc.service';

import { Country, GlobalVariable } from '../../../shared/models/data.model';

@Component({
  selector: 'app-system',
  templateUrl: './system.page.html',
  styleUrls: ['./system.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
    IonLabel, 
    IonGrid, IonRow, IonCol,
    IonSkeletonText, IonSearchbar,
    IonSegment, IonSegmentButton, IonSegmentView, IonSegmentContent,

  ]
})

export class SystemPage implements OnInit {

  loadingData = false;
  emptyRows: Array<any> = Array(5).fill(null);

  countries: Country[] = [];
  filteredCountries: Country[] = [];
  variables: GlobalVariable[] = [];
  filteredVariables: GlobalVariable[] = [];
  countriesSearchTerm: string = '';
  variablesSearchTerm: string = '';

  constructor(
    private loadingController: LoadingController,
    private rpcService: RpcService,
  ) { }

  async ngOnInit() {
  }
  
  async ionViewDidEnter() {
    this.loadingData = true;
    const loading = await this.loadingController.create({
      message: 'Loading data ...'
    })
    await loading.present();
    await this.rpcService.connectGlobalVariables();
    await this.getCountries();
    await this.getVariables();
    this.loadingData = false;
    await loading.dismiss();
  }

  async getCountries() {
    const data = await this.rpcService.getCountriesList();
    if(data.result) {
      this.countries = data.result;
      this.filterCountries();
    }
    else {
      this.countries = [];
      this.filteredCountries = [];
    }
  }

  filterCountries() {
    if (!this.countriesSearchTerm) {
      this.filteredCountries = this.countries;
      return;
    }

    const term = this.countriesSearchTerm.toLowerCase();
    this.filteredCountries = this.countries.filter(country =>
      country.nameShort.toLowerCase().includes(term) ||
      country.nameFull.toLowerCase().includes(term) ||
      country.currencyName.toLowerCase().includes(term)
    );
  }

  async getVariables() {
    const data = await this.rpcService.getGlobalVariables();
    if(data.result) {
      this.variables = data.result;
      this.filterVariables();
    }
    else {
      this.variables = [];
      this.filteredVariables = [];
    }
  }

  filterVariables() {
    if (!this.variablesSearchTerm) {
      this.filteredVariables = this.variables;
      return;
    }

    const term = this.variablesSearchTerm.toLowerCase();
    this.filteredVariables = this.variables.filter(variable =>
      variable.category.toLowerCase().includes(term) ||
      variable.name.toLowerCase().includes(term)
    );
  }
}
