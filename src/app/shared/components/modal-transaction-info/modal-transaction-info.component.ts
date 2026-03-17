import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { ModalTransactionInfoService } from './modal-transaction-info.service';

@Component({
  selector: 'app-modal-transaction-info',
  templateUrl: './modal-transaction-info.component.html',
  styleUrls: ['./modal-transaction-info.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ModalTransactionInfoComponent {
  modalService = inject(ModalTransactionInfoService);
  private router = inject(Router);

  assetName = computed(() => this.modalService.transaction()?.assetName || '');
  assetSymbol = computed(() => this.modalService.transaction()?.assetSymbol || '');

  getTrxTypeClass(trxType: string): string {
    switch (trxType) {
      case 'Subscribe': return 'bg-green-100 text-green-800';
      case 'Redeem':    return 'bg-orange-100 text-orange-800';
      default:          return 'bg-gray-100 text-gray-800';
    }
  }

  navigate(path: string): void {
    this.modalService.close();
    this.router.navigate([path]);
  }

  onClose(): void {
    this.modalService.close();
  }
}
