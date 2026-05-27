import { Injectable, signal } from '@angular/core';

export interface DeclareDistributionData {
  distType: 1 | 2;           // 1 = Credit dividend, 2 = Stock split
  amount: string;            // wei for Credit (currency units), token units for StockSplit
  recordBlock: number;       // 0 = current block at declare time
  sweepResidual: boolean;    // Credit only — refund failed/skipped residual to issuer on finalize
}

@Injectable({ providedIn: 'root' })
export class ModalDistributionDeclareService {
  isVisible = signal(false);
  // Asset address the modal is being opened against (informational only — the
  // caller passes it to the API on confirm).
  assetAddress = signal<string>('');

  private resolveFn?: (value: DeclareDistributionData | null) => void;

  show(assetAddress: string): Promise<DeclareDistributionData | null> {
    this.assetAddress.set(assetAddress);
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(data: DeclareDistributionData) {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(data);
  }

  cancel() {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
