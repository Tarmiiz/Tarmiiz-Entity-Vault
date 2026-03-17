import { Injectable, signal } from '@angular/core';
import { AssetTransaction } from '../../models/data.model';

@Injectable({
  providedIn: 'root'
})
export class ModalTransactionInfoService {
  isVisible = signal(false);
  transaction = signal<AssetTransaction | null>(null);

  show(trx: AssetTransaction): void {
    this.transaction.set(trx);
    this.isVisible.set(true);
  }

  close(): void {
    this.isVisible.set(false);
  }
}
