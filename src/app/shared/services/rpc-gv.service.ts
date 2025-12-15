import { Injectable } from '@angular/core';
import { ethers, parseEther } from 'ethers';

import { environment } from '../../../environments/environment';

import GlobalVariablesAbi from '../../../assets/ABIs/GVProxy.json';

import { Country, GlobalVariable } from '../models/data.model';



@Injectable({
  providedIn: 'root'
})
export class RpcGVService {

  chainId = environment.chainId;

  rpcProvider = new ethers.JsonRpcProvider(environment.rpcNode);
  wsProvider = new ethers.WebSocketProvider(environment.wsNode);
  
  gvAddress = environment.GVProxyContract
  gvContract: any;
  

  signer: any;

  globalVariables: GlobalVariable[] = [];
  countriesList: Country[] = [];
  
  constructor() {}
  
  async init(){}


// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Global Variables
// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  
  async connectGlobalVariables() {
    try {
      this.gvContract = new ethers.Contract(this.gvAddress, GlobalVariablesAbi, this.signer);
    }
    catch (error: any) {
      
    }
  }

  async getCountriesList() {
    try {
      const result = await this.gvContract.countriesList();
      this.countriesList = result.map((country: any) => ({ 
        countryId: Number(country[0]), 
        nameShort: country[1],
        nameFull: country[2],
        alpha2Code: country[3],
        alpha3Code: country[4],
        currencyName: country[5],
        currencyCode: country[6],
        callingCode: Number(country[7]),
        countryCode: Number(country[8])
      }));
      return { result: this.countriesList, error: ''};
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching countries list'};
    }
  } 

  async getCategoriesList() {
    try {
      const result = await this.gvContract.variableCategoriesList();
      return { result, error: ''};
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching categories list'};
    }
  }

  async getGlobalVariables() {
    try {
      this.globalVariables = [];
      const result = await this.getCategoriesList();
      if(result.result) {
        for(let i = 0; i < result.result.length; i++) {
          const category = result.result[i];
          const variables = await this.getGlobalVariableByCategory(category);
          if(variables) {
            const variable = variables.result.map((variable: any) => ({
              category: category,
              variableId: variable.variableId,
              name: variable.name,
              visible: variable.visible,
            }))
            this.globalVariables.push(...variable);
          }
        }
        return { result: this.globalVariables , error: ''};
      }
      else {
        return { result: null, error: 'Error fetching assets list'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list'};
    }
  }

  async getGlobalVariableByCategory(category: string) {
    try {
      const result = await this.gvContract.variablesListByCategory(category);
      if(result) {
        const variables = result.map((variable: any) => ({
          variableId: Number(variable[0]),
          name: variable[1],
          visible: variable[2],
        }))
        return { result: variables, error: ''};
      }
      else {
        return { result: null, error: 'Error fetching assets list'};
      }
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list'};
    }
  }

  async getSystemVariableById(category: string, id: number) {
    try {
      const result = await this.gvContract.sysvarById(category, id);
        return { result, error: ''};
    }
    catch (error: any) {
      return { result: null, error: 'Error fetching assets list'};
    }
  }

}
