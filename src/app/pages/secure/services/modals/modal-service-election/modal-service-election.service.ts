import { Injectable, signal } from '@angular/core';

// ── The election vocabulary lives in ONE place ────────────────────────────────────────────────
// `modal-service-add.service.ts` already owns ELECTION_ONC / ELECTION_OFFC / PAY_ROLE_* and the
// election -> payRole mapping. They are RE-EXPORTED here (not redefined) so a consumer of this
// modal can import the modal and its vocabulary from one file while there is still exactly one
// definition of the mapping.
//
// ⚠️ Why one definition matters: the mapping is INVERTED — ELECTION_ONC (1) maps to
// PAY_ROLE_MINTER (2), and ELECTION_OFFC (2) to PAY_ROLE_RAIL (1). A second copy is exactly how
// the election ends up passed through as the role: it encodes cleanly, reverts nowhere, and
// attaches the wrong KIND of payment provider. Mirrors `ServiceTemplate._payRoleFor`.
export {
  ELECTION_ONC,
  ELECTION_OFFC,
  PAY_ROLE_RAIL,
  PAY_ROLE_MINTER,
  payRoleForElection,
} from '../modal-service-add/modal-service-add.service';

/**
 * No election declared for this currency. The correct RESTING state of a new service, not an
 * unfinished one — a payment provider's role is validated against the election, so before one is
 * declared there is nothing to validate against and no attachment is possible.
 */
export const ELECTION_UNDECLARED = 0;

/**
 * A state the service IS IN, not an event between two states: an approved switch converts every
 * subscription page by page, and payment legs in that currency are refused for the duration.
 */
export const ELECTION_MIGRATING = 3;

/** One currency this service could declare an election for. */
export interface ServiceElectionCurrencyOption {
  currencyCode: number;
  currencyName: string;
}

/**
 * 'declare' — the operator picks BOTH the currency and the election.
 * 'switch'  — the currency is fixed (`currencyCode`) and the operator picks a TARGET election,
 *             which must differ from `currentElection`.
 *
 * ⚠️ 'declare' HAS NO CALLER IN THE ENTITY VAULT, AND MUST NOT GAIN ONE. `P_ELECTION_DECLARE` is
 * gated `K_REGULATOR_OF`: the REGULATOR declares a service's initial election, per currency —
 * because `onc` lets the service MINT credit against fiat it claims to hold in reserve, and under
 * the old entity-declares rule the very first (and most consequential) position passed through no
 * approval at all. An entity-side declare call is refused on chain, so wiring this mode up here
 * would offer the operator a form whose submit always fails. The entity's only verb is 'switch',
 * which is a REQUEST its regulator then approves.
 *
 * The mode is kept rather than deleted so the modal stays a complete, self-describing surface for
 * a regulator-side consumer — not as an invitation.
 */
export type ServiceElectionModalMode = 'declare' | 'switch';

export interface ServiceElectionModalInput {
  /**
   * Currencies offered in 'declare' mode. The CALLER decides what belongs here — a currency that
   * already carries an election is a switch, not a declaration, so it should not be in this list.
   * Ignored in 'switch' mode, where `currencyCode` is authoritative.
   */
  currencies: ServiceElectionCurrencyOption[];
  /** 'switch' mode: the election in force today. The target must differ from it. */
  currentElection?: number;
  /** 'switch' mode: the currency being switched, shown read-only. */
  currencyCode?: number;
}

export interface ServiceElectionModalResult {
  currencyCode: number;
  /** ELECTION_ONC (1) | ELECTION_OFFC (2) — never 0 or 3; the modal cannot resolve to either. */
  election: number;
}

@Injectable({ providedIn: 'root' })
export class ModalServiceElectionService {
  isVisible = signal(false);
  mode = signal<ServiceElectionModalMode>('declare');
  input = signal<ServiceElectionModalInput>({ currencies: [] });

  private resolveFn?: (value: ServiceElectionModalResult | null) => void;

  show(mode: ServiceElectionModalMode, opts: ServiceElectionModalInput): Promise<ServiceElectionModalResult | null> {
    this.mode.set(mode);
    this.input.set({
      currencies: opts?.currencies ?? [],
      currentElection: opts?.currentElection,
      currencyCode: opts?.currencyCode,
    });
    this.isVisible.set(true);

    return new Promise<ServiceElectionModalResult | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(result: ServiceElectionModalResult): void {
    this.isVisible.set(false);
    this.resolveFn?.(result);
  }

  cancel(): void {
    this.isVisible.set(false);
    this.resolveFn?.(null);
  }
}
