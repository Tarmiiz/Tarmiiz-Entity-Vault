import { Injectable, signal } from '@angular/core';

import { PARTY_CLASS } from '../../../../../shared/constants/party-class';

/**
 * ONE picker for the two fund-level appointments — Depositary (7) and Fund Administrator (8),
 * Phase 4.9's additions to the service-attach band. They are the same shape of party as a
 * clearing house (regulator-endorsed, entity-curated, attached by role id), so a single modal
 * parameterised by role replaces two role-specific clones of `modal-service-clearing-house`.
 *
 * `role` is the PARTY_CLASS id — deliberately not named after the retired `Service.partyClass`
 * field (Phase 28), which `check-retired-fields.js` refuses by identifier.
 */
@Injectable({
  providedIn: 'root'
})
export class ModalServiceFundPartyService {
  isVisible = signal(false);
  /** Which class the open picker is for — decides the candidate endpoint, the title and the label. */
  role = signal<number>(PARTY_CLASS.DEPOSITARY);
  // Addresses already attached to the service — hidden from the picker (attaching one
  // again is a no-op on-chain, so offering it can only mislead).
  excluded = signal<string[]>([]);

  private resolveFn?: (value: string | null) => void;

  show(role: number, exclude: string[] = []): Promise<string | null> {
    this.role.set(role);
    this.excluded.set(exclude.map(a => a.toLowerCase()));
    this.isVisible.set(true);

    return new Promise<string | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(party: string): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(party);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
