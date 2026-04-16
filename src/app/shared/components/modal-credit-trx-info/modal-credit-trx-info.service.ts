import { Injectable, signal } from '@angular/core';
import { CreditTransaction } from '../../models/data.model';

@Injectable({
  providedIn: 'root'
})
export class ModalCreditTrxInfoService {
  isVisible = signal(false);
  transaction = signal<CreditTransaction | null>(null);

  show(trx: CreditTransaction): void {
    this.transaction.set(trx);
    this.isVisible.set(true);
  }

  close(): void {
    this.isVisible.set(false);
  }
}
