import { Injectable, signal } from '@angular/core';

/*
    "Pick a provider for this asset role" — the replacement for the free-text `0x` box on the
    asset's Class parties surface.

    `Classes.attachParty` refuses on two grounds the operator could not see: the party must be
    of the role's party class, and — for every role EXCEPT Servicer — it must not be one of
    the issuer's own services (`AssetClassLib.roleRequiresIndependence`). Both are decided by
    `GET /asset-class/providers?role=`, so this picker offers only addresses the contract will
    accept instead of letting a wrong one reach it and come back as a revert.

    The role -> party-class map stays SERVER-side (it is irregular: Engineer is class 19, not
    `role + 8`), so this modal takes a role and never a class.
*/

export interface PartyPickerRequest {
  role: number;
  roleName: string;
}

export interface PartyPickerCandidate {
  address: string;
  name: string;
  level: number;
  state: number;
  countryCode: number;
  source: 'owned' | 'endorsed';
}

@Injectable({ providedIn: 'root' })
export class ModalPartyPickerService {
  isVisible = signal(false);
  request = signal<PartyPickerRequest | null>(null);

  private resolveFn?: (value: PartyPickerCandidate | null) => void;

  show(request: PartyPickerRequest): Promise<PartyPickerCandidate | null> {
    this.request.set(request);
    this.isVisible.set(true);
    return new Promise<PartyPickerCandidate | null>((resolve) => { this.resolveFn = resolve; });
  }

  confirm(data: PartyPickerCandidate): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(data);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
