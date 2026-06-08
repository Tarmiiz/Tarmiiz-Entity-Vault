import { Injectable, signal } from '@angular/core';
import { CreditBalance } from '../../../../../shared/models/data.model';

// Bank hub move — the entity (acting as a Bank-level payment processor) moves an identity's
// credit between its bank-account hub and a spoke subscription. Same-identity + hub rules are
// enforced on-chain; this modal only collects the inputs.
@Injectable({ providedIn: 'root' })
export class ModalBankTransferService {
  isVisible = signal(false);
  currencies = signal<CreditBalance[]>([]);

  private resolveFn?: (value: { ok: boolean } | null) => void;

  show(input: { currencies: CreditBalance[] }): Promise<{ ok: boolean } | null> {
    this.currencies.set(input.currencies || []);
    this.isVisible.set(true);
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  confirm(): void { this.isVisible.set(false); this.resolveFn?.({ ok: true }); }
  cancel(): void { this.isVisible.set(false); this.resolveFn?.(null); }
}
