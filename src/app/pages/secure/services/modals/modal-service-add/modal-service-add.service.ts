import { Injectable, signal } from '@angular/core';

export interface AddServiceData {
  name: string;
  description: string;
  website: string;
  email: string;
  mobile: string;
  verificationLevel: number;
  // ⚠️ LICENCE APPLICATIONS replace `serviceType` / `partyClass` / `marketClass` (Phase 28
  // step (e), 2026-09-03). The wizard no longer says what the service IS, it says what it
  // APPLIES TO DO — every entry lands `LICENSE_REQUESTED` and confers nothing until a
  // regulator approves, so this payload can never grant.
  //
  // `countryCode: 0` is the sentinel for "the service's own country", resolved on chain, so a
  // caller never restates a fact the registry already holds. An EMPTY ARRAY is legal and is the
  // neutral case — do not default it to a licence to make a demo work.
  requestLicenses: { classId: number; countryCode: number }[];
  regulator: string;
  validator: string;
  // ⚠️ Always '' now — there is no picker for it. A payment provider does not attach through
  // `partyAttach`: it attaches PER CURRENCY via `addPaymentProvider(provider, currencyCode,
  // payRole)`, and the role is validated against that currency's election — which only the
  // REGULATOR declares. Nothing can be attached at create time, so the field is inert and the
  // create payload no longer carries it. Attach from the service's Service Providers tab once
  // the regulator has declared the election.
  paymentProcessor: string;
  custodian: string;
  // Optional, type-1 only. Empty = none, which is MEANINGFUL rather than missing: no clearing
  // house means this market's credit is final and every fill settles immediately.
  clearingHouse: string;
  visibility: number;
}

// ⚠️ THE WIZARD NO LONGER SETS AN ELECTION, and the constants below are kept for the surfaces
// that still need the vocabulary (the service detail page's Election tab and its switch-request
// modal). The entity cannot declare an election at all: `P_ELECTION_DECLARE` is gated
// `K_REGULATOR_OF`, so the REGULATOR declares a service's initial onc/offc election, per currency.
// A wizard field for it would be a promise the platform refuses at submit.
//
// The election -> payRole mapping stays in ONE place. Note the INVERSION: ELECTION_ONC (1) maps
// to PAY_ROLE_MINTER (2) and ELECTION_OFFC (2) to PAY_ROLE_RAIL (1). Writing it inline anywhere
// is an invitation to pass the election through as the role, which encodes cleanly and attaches
// the wrong kind of provider. Mirrors `ServiceTemplate._payRoleFor`.
export const ELECTION_ONC = 1;
export const ELECTION_OFFC = 2;
export const PAY_ROLE_RAIL = 1;
export const PAY_ROLE_MINTER = 2;
export function payRoleForElection(election: number): number {
  return Number(election) === ELECTION_ONC ? PAY_ROLE_MINTER : PAY_ROLE_RAIL;
}

// Sentinel for self-custody at serviceCreate; ServiceTemplate substitutes address(this) at init.
export const SELF_CUSTODY_SENTINEL = '0x0000000000000000000000000000000000000001';

@Injectable({
  providedIn: 'root'
})
export class ModalServiceAddService {
  isVisible = signal(false);

  private resolveFn?: (value: AddServiceData | null) => void;

  show(): Promise<AddServiceData | null> {
    this.isVisible.set(true);
    return new Promise<AddServiceData | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(data: AddServiceData): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(data);
    }
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) {
      this.resolveFn(null);
    }
  }
}
