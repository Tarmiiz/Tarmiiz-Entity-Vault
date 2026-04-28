import { Injectable, signal } from '@angular/core';

export interface ResyncResult {
  mode: 'snapshot' | 'events' | 'both';
  fromBlock: number;
}

@Injectable({
  providedIn: 'root'
})
export class ModalResyncService {
  isVisible = signal(false);
  currentBlock = signal(0);
  lastSyncedBlock = signal(0);
  isSyncing = signal(false);

  private resolveFn?: (value: ResyncResult | null) => void;

  show(currentBlock: number, lastSyncedBlock: number, isSyncing: boolean): Promise<ResyncResult | null> {
    this.currentBlock.set(currentBlock);
    this.lastSyncedBlock.set(lastSyncedBlock);
    this.isSyncing.set(isSyncing);
    this.isVisible.set(true);

    return new Promise<ResyncResult | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(result: ResyncResult): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(result);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
