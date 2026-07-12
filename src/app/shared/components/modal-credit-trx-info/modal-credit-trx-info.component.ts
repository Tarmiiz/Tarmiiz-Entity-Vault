import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import jsPDF from 'jspdf';

import { UtilsService } from '../../services/utils.service';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { AlertService } from '../alerts/alert/alert.service';
import { LoadingService } from '../alerts/loading/loading.service';
import { applyPdfFooter } from '../../utils/pdf-export.utils';
import { CreditTransaction } from '../../models/data.model';
import { ModalCreditTrxInfoService } from './modal-credit-trx-info.service';

@Component({
  selector: 'app-modal-credit-trx-info',
  templateUrl: './modal-credit-trx-info.component.html',
  styleUrls: ['./modal-credit-trx-info.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ModalCreditTrxInfoComponent {
  modalService = inject(ModalCreditTrxInfoService);
  private router = inject(Router);
  private utils = inject(UtilsService);
  private authService = inject(AuthService);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);

  getTrxTypeClass(trxType: number): string {
    switch (trxType) {
      case 1: return 'bg-green-100 text-green-800';
      case 2: return 'bg-orange-100 text-orange-800';
      case 3: return 'bg-blue-100 text-blue-800';
      case 4: return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getTrxStateClass(state: number): string {
    switch (state) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-red-100 text-red-800';
      case 4: return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  // Ledger-only routing marker for route transfers (origin 14) — mirrors the on-chain
  // ROUTE_SWITCH constant (CreditProxy.routeSwitchAddress()). Never a real account.
  private readonly ROUTE_SWITCH = '0xc3530d49773e8af0eb911ff424b5fd2bc23e07ea';

  isZero(addr: string): boolean {
    return !addr || /^0x0+$/i.test(addr);
  }

  isSwitch(addr: string): boolean {
    return !!addr && addr.toLowerCase() === this.ROUTE_SWITCH;
  }

  isSubscription(addr: string): boolean {
    const sub = this.modalService.subscriptionAddress();
    return !!addr && !!sub && addr.toLowerCase() === sub.toLowerCase();
  }

  navigate(path: string): void {
    this.modalService.close();
    this.router.navigate([path]);
  }

  onClose(): void {
    this.modalService.close();
  }

  // Open the SP-receipt document referenced by trx.dataCid. The receipt doc is owned by the
  // SERVICE template, so it's resolved through the existing service-documents machinery:
  // list the service's documents, match by CID, then stream via the standard file-view flow.
  // The tab is claimed synchronously inside the click gesture (same pattern as documents-tab),
  // or the deferred window.open is dropped by the popup blocker after the fetch await.
  async viewReceipt(trx: CreditTransaction): Promise<void> {
    if (!trx.dataCid || !trx.service) return;
    const win = window.open('', '_blank');
    this.loadingService.show('Fetching receipt...');
    try {
      const data = await this.apiService.serviceDocumentsList(trx.service, 1, 200);
      const doc = (data?.documents ?? []).find((d: any) => d.cid === trx.dataCid);
      if (!doc) {
        if (win) win.close();
        await this.alertService.show('Error', 'Receipt document not found on the service.');
        return;
      }
      const fetched = await this.apiService.serviceDocumentFetchFile(trx.service, doc.id ?? doc.documentId);
      if (!fetched) {
        if (win) win.close();
        await this.alertService.show('Error', 'Could not fetch the receipt file.');
        return;
      }
      if (win) {
        win.location.href = fetched.blobUrl;
      } else {
        window.open(fetched.blobUrl, '_blank');
      }
      setTimeout(() => URL.revokeObjectURL(fetched.blobUrl), 60_000);
    } finally {
      this.loadingService.hide();
    }
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

    // ── header band ──────────────────────────────────────────────
    doc.setFillColor(32, 42, 59);
    doc.rect(0, 0, W, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('CREDIT TRANSACTION RECEIPT', W / 2, 12, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(trx.trxTypeName.toUpperCase(), W / 2, 20, { align: 'center' });
    y = 36;

    const row = (label: string, value: string, mono = false) => {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(110, 110, 110);
      doc.text(label, pad, y);
      doc.setFont(mono ? 'courier' : 'helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
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

    row('Trx ID', String(trx.trxId), true);
    row('Date & Time', formatDate(trx.startTime));
    if (trx.updateTime && trx.updateTime !== trx.startTime) row('Last Update', formatDate(trx.updateTime));
    row('State', trx.trxStateName);
    divider();

    row('Type', trx.trxTypeName);
    row('Currency', `${trx.currencySymbol} (${trx.currencyCode})`);
    if (trx.trxRefNo) row('Reference No', trx.trxRefNo, true);
    if (trx.service) row('Service', trx.serviceName || trx.service, !trx.serviceName);
    divider();

    const label = trx.serviceName || trx.service;
    const fmtEndpoint = (addr: string, name: string, zeroTag: string) =>
      this.isZero(addr) ? `${label} ${zeroTag}`
        : this.isSwitch(addr) ? 'Credit Switch (route transfer)'
        : (name ? `${name}  ${addr}` : addr);
    if (trx.from) row('From', fmtEndpoint(trx.from, trx.fromName, '(mint)'), !this.isZero(trx.from) && !trx.fromName);
    if (trx.to)   row('To',   fmtEndpoint(trx.to,   trx.toName,   '(burn)'), !this.isZero(trx.to)   && !trx.toName);
    if (trx.trxData) {
      divider();
      row('Data', trx.trxData);
    }

    // ── total band ───────────────────────────────────────────────
    y += 1;
    doc.setFillColor(245, 247, 250);
    doc.rect(pad - 2, y - 2, W - (pad - 2) * 2, 12, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Amount', pad, y + 5);
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(`${trx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${trx.currencySymbol}`, valX, y + 5, { align: 'right' });
    y += 18;

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`credit_receipt_trx${trx.trxId}_${stamp}.pdf`);
  }
}
