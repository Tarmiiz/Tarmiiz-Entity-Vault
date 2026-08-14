import { Injectable, signal } from '@angular/core';

import { GlobalVariable } from '../../models/data.model';

/*
    The identifier add/edit modal, shared by the ENTITY profile (LEI, commercial registry,
    tax id, … bound against the entity's own DID) and the ASSET detail page (ISIN, … stored
    in the asset's public metadata).

    One component rather than two: the caller already supplies the ID-type vocabulary, so
    nothing in here is specific to either population — only the validation rules differ, and
    those are keyed by TYPE NAME inside `identifier.utils.ts`.
*/
export interface IdentifierInput {
  // The `ID Type - *` options, resolved from Global Variables by the caller so the modal
  // never hardcodes a vocabulary. Passing them in (rather than fetching here) keeps the
  // page as the single owner of that lookup — and is what lets one modal serve both
  // categories.
  idTypes: GlobalVariable[];
  // Pre-selected type + current value when editing an existing row; omitted when adding.
  idType?: number;
  value?: string;
  // Whether to collect a reason. The entity write records one on-chain; an asset identifier
  // is a plain metadata edit with nothing to carry it, so that page hides the field.
  showReason?: boolean;
}

export interface IdentifierResult {
  idType: number;
  // Already normalized (LEI / ISIN upper-cased) — the caller sends this verbatim.
  value: string;
  reason: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModalIdentifierService {
  isVisible = signal(false);
  input = signal<IdentifierInput>({ idTypes: [] });

  private resolveFn?: (value: IdentifierResult | null) => void;

  show(input: IdentifierInput): Promise<IdentifierResult | null> {
    this.input.set(input);
    this.isVisible.set(true);
    return new Promise<IdentifierResult | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(data: IdentifierResult): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(data);
  }

  cancel(): void {
    this.isVisible.set(false);
    if (this.resolveFn) this.resolveFn(null);
  }
}
