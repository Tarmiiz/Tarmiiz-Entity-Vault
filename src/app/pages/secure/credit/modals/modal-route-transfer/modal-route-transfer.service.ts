import { Injectable, signal } from '@angular/core';
import { CreditBalance } from '../../../../../shared/models/data.model';

// Anonymous service-routed move — the entity's source service routes one of its subscribers'
// credit to that SAME identity's account at another service. The destination subscription is
// resolved on-chain (the sibling sub + the subscriber DID are never exposed to either service).
@Injectable({ providedIn: 'root' })
export class ModalRouteTransferService {
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
