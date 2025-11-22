import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import {
  IonContent,
} from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";

import { RpcService } from '../../../../../shared/services/rpc.service';
import { cKYCOperator } from '../../../../../shared/models/data.model';

@Component({
  selector: 'app-ckyc-operators-list',
  templateUrl: './ckyc-operators-list.page.html',
  styleUrls: ['./ckyc-operators-list.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, FormsModule,
    HeaderComponent,
  ]
})
export class CkycOperatorsListPage implements OnInit {

  loadingOperators: boolean = false;

  operatorsCount = 0
  operators = signal<cKYCOperator[]>([]);
  operatorsSearchTerm = signal('');
  // filteredOperators: cKYCOperator[] = [];
  // operatorsSearchTerm: string = '';

  emptyRows: Array<any> = Array(5).fill(null)


  constructor(
    private loadingController: LoadingController,
    private rpcService: RpcService,
    private router: Router
  ) { }

  ngOnInit() {

  }

  async ionViewWillEnter() {
    // this.operators = [];
    this.operatorsCount = 0;
  }  

  async ionViewDidEnter() {
    this.loadingOperators = true;
    const loading = await this.loadingController.create({
      message: 'Loading data ...'
    })
    await loading.present();
    // await this.rpcService.connectGlobalVariables();
    // await this.rpcService.getGlobalVariables();
    await this.listOperators();
    this.loadingOperators = false;
    this.loadingController.dismiss();
  }

  async listOperators() {
    const result = await this.rpcService.cKYCOperatorsList();
    if(result.result) {
      this.operatorsCount = result.result.count;
      this.operators.set(result.result.operators);
    }
    else {
      console.log(result.error);
    }
  }  

  viewDetails(operator: cKYCOperator) {
    this.router.navigate(['/authorized/ckyc/operators/details/' + operator.operator]);
  }

  filteredOperators = computed(() => {
    const term = this.operatorsSearchTerm().toLowerCase();
    if (!term) return this.operators();
    return this.operators().filter(
      c => c.name.toLowerCase().includes(term) || 
      c.symbol.toLowerCase().includes(term) || 
      c.operator.toLowerCase().includes(term));
  });  

  onOperatorsSearch(event: Event) {
    this.operatorsSearchTerm.set((event.target as HTMLInputElement).value);
  }  

  // filterOperators() {
  //   if (!this.operatorsSearchTerm) {
  //     this.filteredOperators = this.operators;
  //     return;
  //   }

  //   const term = this.operatorsSearchTerm.toLowerCase();
  //   this.filteredOperators = this.operators.filter(operator =>
  //     operator.name.toLowerCase().includes(term) ||
  //     operator.symbol.toLowerCase().includes(term) ||
  //     operator.operator.toLowerCase().includes(term)
  //   );
  // }

}
