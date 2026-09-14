import { Injectable, signal } from '@angular/core';

/** Which of the two Import buttons opened the wizard. */
export type FundImportMode = 'subscribers' | 'balances';

/**
 * Opener for the fund-import wizard.
 *
 * Follows the modal-service-* convention (a signal-backed injectable + a promise resolver), with
 * one deliberate difference: `show()` resolves with `true` when an import was actually STARTED, so
 * the host page can refresh, and `false` when the operator backed out. It does not resolve with a
 * result payload, because the run outlives the modal — the job keeps going if the wizard is closed,
 * and the Import tab's history table is where it is followed from then on.
 */
@Injectable({ providedIn: 'root' })
export class ModalFundImportService {
  isVisible = signal(false);
  mode = signal<FundImportMode>('subscribers');
  serviceAddress = signal<string>('');

  private resolveFn?: (started: boolean) => void;

  show(mode: FundImportMode, serviceAddress: string): Promise<boolean> {
    this.mode.set(mode);
    this.serviceAddress.set(serviceAddress);
    this.isVisible.set(true);
    return new Promise<boolean>((resolve) => { this.resolveFn = resolve; });
  }

  close(started: boolean): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(started);
    this.resolveFn = undefined;
  }
}
