import { Injectable, signal } from '@angular/core';

/**
 * 33.G G.4 — the issuer records a NAV (row 38) or portfolio (row 37) attestation. The API pins
 * it as a Private asset document shared to the attesting party + the regulator and declares it
 * against the row; the party then signs it from its own Vault, which is what makes it count.
 */
export interface AttestationModalInput {
  symbol: string;
  currencyCode: string;
  /** Pre-selected row; the operator may switch. */
  row: 37 | 38;
  /** What the API would default `attestedBy` to, for the hint (may be empty). */
  defaultAttester?: string;
}

export interface AttestationModalResult {
  row: 37 | 38;
  attestation: Record<string, any>;
  attestedBy?: string;
}

@Injectable({ providedIn: 'root' })
export class ModalAttestationService {
  isVisible = signal(false);
  input = signal<AttestationModalInput | null>(null);

  private resolveFn?: (value: AttestationModalResult | null) => void;

  show(input: AttestationModalInput): Promise<AttestationModalResult | null> {
    this.input.set(input);
    this.isVisible.set(true);
    return new Promise<AttestationModalResult | null>((resolve) => { this.resolveFn = resolve; });
  }

  confirm(result: AttestationModalResult): void {
    this.isVisible.set(false);
    this.resolveFn?.(result);
  }

  cancel(): void {
    this.isVisible.set(false);
    this.resolveFn?.(null);
  }
}
