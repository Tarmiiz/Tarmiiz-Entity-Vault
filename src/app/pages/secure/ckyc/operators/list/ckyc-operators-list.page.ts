import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";

import { RpcService } from '../../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';

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
    private rpcService = inject(RpcService);
    private router = inject(Router);
    private loadingService = inject(LoadingService);

  loadingOperators: boolean = false;

  operatorsCount = 0
  operators = signal<cKYCOperator[]>([]);
  operatorsSearchTerm = signal('');

  emptyRows: Array<any> = Array(5).fill(null)

  constructor(
  ) { }

  ngOnInit() {
  }

  async ionViewWillEnter() {
    this.operators.set([]);
    this.operatorsCount = 0;
  }  

  async ionViewDidEnter() {
    this.loadingOperators = true;
    await this.listOperators();
    this.loadingOperators = false;
  }
  
  async listOperators() {
    this.loadingService.show('Loading data...');
    const result = await this.rpcService.cKYCOperatorsList();
    if(result.result) {
      this.operatorsCount = result.result.count;
      this.operators.set(result.result.operators);
    }
    else {
      console.log(result.error);
    }
    this.loadingService.hide();
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
      c.email.toLowerCase().includes(term) || 
      c.mobile.toLowerCase().includes(term) || 
      c.operator.toLowerCase().includes(term)
    );
  });  

  onOperatorsSearch(event: Event) {
    this.operatorsSearchTerm.set((event.target as HTMLInputElement).value);
  }  


}
