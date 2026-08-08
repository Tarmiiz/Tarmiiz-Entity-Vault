import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import jsPDF from 'jspdf';

import { UtilsService } from '../../services/utils.service';
import { AuthService } from '../../services/auth.service';
import { FeaturesService } from '../../services/features.service';
import { applyPdfFooter } from '../../utils/pdf-export.utils';
import { ModalTransactionInfoService } from './modal-transaction-info.service';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-modal-transaction-info',
  templateUrl: './modal-transaction-info.component.html',
  styleUrls: ['./modal-transaction-info.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslatePipe, MoneyPipe],
})
export class ModalTransactionInfoComponent {
  modalService = inject(ModalTransactionInfoService);
  features = inject(FeaturesService);
  private router = inject(Router);
  private utils = inject(UtilsService);
  private authService = inject(AuthService);

  assetName = computed(() => this.modalService.transaction()?.assetName || '');
  assetSymbol = computed(() => this.modalService.transaction()?.assetSymbol || '');

  getTrxTypeClass(trxType: string): string {
    switch (trxType) {
      case 'Subscribe': return 'bg-green-100 text-green-800';
      case 'Redeem':    return 'bg-orange-100 text-orange-800';
      case 'Trade':     return 'bg-purple-100 text-purple-800';
      case 'Transfer':  return 'bg-blue-100 text-blue-800';
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

  exportPdf(): void {
    const trx = this.modalService.transaction();
    if (!trx) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
    const W = doc.internal.pageSize.getWidth();
    const pad = 14;
    const valX = W - pad;
    let y = 0;

    const formatDate = (ts: number) => this.utils.formatDate(ts);
    const fmtTokens  = (n: number)  => this.utils.formatTokens(n);
    const fmtPrice   = (n: number)  => this.utils.formatPrice(n);

    // ── header band ──────────────────────────────────────────────
    doc.setFillColor(32, 42, 59);
    doc.rect(0, 0, W, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('TRANSACTION RECEIPT', W / 2, 12, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(trx.trxType.toUpperCase(), W / 2, 20, { align: 'center' });
    y = 36;

    // ── helpers ──────────────────────────────────────────────────
    const row = (label: string, value: string, mono = false) => {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(110, 110, 110);
      doc.text(label, pad, y);
      doc.setFont(mono ? 'courier' : 'helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      // wrap value if too long, right-aligned on first line
      const maxValW = W - pad - 60;
      const lines: string[] = doc.splitTextToSize(value, maxValW);
      doc.text(lines[0], valX, y, { align: 'right' });
      if (lines.length > 1) {
        for (let i = 1; i < lines.length; i++) {
          y += 4.5;
          doc.text(lines[i], valX, y, { align: 'right' });
        }
      }
      y += 5.5;
    };

    const divider = () => {
      doc.setDrawColor(220, 220, 220);
      doc.line(pad, y, W - pad, y);
      y += 5;
    };

    // ── fields ───────────────────────────────────────────────────
    row('Asset', `${trx.assetName}${trx.assetSymbol ? ' (' + trx.assetSymbol + ')' : ''}`);
    row('Asset Address', trx.asset, true);
    if (trx.trxType === 'Subscribe') {
      row('Subscription', trx.to, true);
    } else if (trx.trxType === 'Redeem') {
      row('Subscription', trx.from, true);
    } else if (trx.trxType === 'Trade') {
      row('Seller', trx.from, true);
      row('Buyer',  trx.to,   true);
    } else {
      row('From', trx.from, true);
      row('To', trx.to, true);
    }
    divider();

    row('Service Trx ID', String(trx.serviceTrxId), true);
    row('Date & Time', formatDate(trx.time));
    if (trx.trxRefNo) row('Ref No', trx.trxRefNo, true);
    divider();

    row('Service', trx.serviceName);
    row('Manager', trx.managerName);
    divider();

    row('Tokens', fmtTokens(trx.tokens));
    row('Token Price', fmtPrice(trx.price));

    // ── total band ───────────────────────────────────────────────
    y += 1;
    doc.setFillColor(245, 247, 250);
    doc.rect(pad - 2, y - 2, W - (pad - 2) * 2, 12, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Total', pad, y + 5);
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(fmtPrice(trx.totalPrice), valX, y + 5, { align: 'right' });
    y += 18;

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`receipt_trx${trx.serviceTrxId}_${stamp}.pdf`);
  }
}
