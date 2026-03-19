import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { HeaderComponent } from "../../../../shared/components/header/header.component";
import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { ModalTransactionInfoService } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.component';
import { AssetTransaction } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    ModalTransactionInfoComponent,
  ]
})
export class ListPage implements OnInit {
  private rpcService = inject(RpcService);
  private loadingService = inject(LoadingService);
  private modalTransactionInfoService = inject(ModalTransactionInfoService);

  transactions = signal<AssetTransaction[]>([]);
  totalCount = signal<number>(0);
  start = 0;
  pageSize = 20;

  constructor() {}

  async ngOnInit() {}

  async ionViewDidEnter() {
    await this.load();
  }

  async load() {
    this.loadingService.show('Loading transactions...');
    const result = await this.rpcService.assetTransactions(this.start, this.pageSize);
    if (result.result) {
      this.transactions.set(result.result.transactions);
      this.totalCount.set(result.result.count);
    }
    this.loadingService.hide();
  }

  viewDetails(trx: AssetTransaction): void {
    this.modalTransactionInfoService.show(trx);
  }

  formatDate(timestamp: number): string {
    if (!timestamp) return '-';
    return new Date(timestamp * 1000).toLocaleString();
  }

}
