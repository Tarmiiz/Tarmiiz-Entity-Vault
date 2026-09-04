import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ApiService } from '../../../../../shared/services/api.service';
import { ModalAssetRegisterExistingService } from './modal-asset-register-existing.service';

// Path B — register an issuer's pre-deployed BYO contract.
// Two-screen flow inside one modal:
//   1. Address input → "Preview" → on-chain previewRegisterAsset returns
//      { ok, rejectReason, standard, tokenType, name, symbol, issuer, ... }
//      so the issuer can confirm what would be registered.
//   2. On confirm, registerAsset runs. Success closes the modal + tells the list
//      page to refresh.
@Component({
  selector: 'app-modal-asset-register-existing',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './modal-asset-register-existing.component.html',
})
export class ModalAssetRegisterExistingComponent {
  svc        = inject(ModalAssetRegisterExistingService);
  private api = inject(ApiService);

  address = signal('');
  loading = signal(false);
  error   = signal<string>('');
  preview = signal<any | null>(null);

  // ─── Phase 4.9 — the class formula ────────────────────────────────────────
  //
  // `registerAsset` now takes one, and the registry checks it against the token: the
  // formula's regulator must be the asset's, and its base class must equal the class the
  // token declares. Path B is BETTER placed than the wizard to enforce that, because the
  // preview has already read both facts off the contract — so the picker is narrowed to
  // exactly the formulas that can succeed, rather than offering some that would revert.
  formulas       = signal<{ formula: string; name: string; base_class: number; regulator: string }[]>([]);
  formulasLoaded = signal(false);
  selectedFormula = signal('');

  private addressLooksValid(): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(this.address().trim());
  }

  async runPreview() {
    this.error.set('');
    this.preview.set(null);
    this.formulas.set([]);
    this.formulasLoaded.set(false);
    this.selectedFormula.set('');
    if (!this.addressLooksValid()) {
      this.error.set('Enter a valid 0x… 40-hex contract address.');
      return;
    }
    this.loading.set(true);
    try {
      const r = await this.api.assetPreviewRegister(this.address().trim());
      if (!r) {
        this.error.set('Preview call failed.');
      } else if (r.preview?.ok === false) {
        this.error.set(r.preview.rejectReason || 'Contract does not pass conformance checks.');
        this.preview.set(r.preview);
      } else {
        this.preview.set(r.preview ?? null);
        await this.loadFormulas(r.preview);
      }
    } catch (e: any) {
      this.error.set(e?.message || String(e));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * The Active formulas this specific contract could be registered under — scoped by BOTH
   * halves of the on-chain rule, using what the preview read off the token itself.
   *
   * An empty result is meaningful and must not read as a failure: it means this regulator
   * has published no Active product over the class this token declares, which is a real and
   * expected state on a fresh chain.
   */
  private async loadFormulas(preview: any) {
    try {
      const rows = await this.api.assetClassFormulas({
        regulator: preview?.regulator,
        baseClass: Number(preview?.assetClass),
        state: 2,
      });
      this.formulas.set(rows ?? []);
      // Auto-select when there is exactly one — the choice is not a choice, and making the
      // operator click it adds a step that can only be got wrong by skipping.
      if ((rows ?? []).length === 1) this.selectedFormula.set(rows[0].formula);
    } catch {
      this.formulas.set([]);
    } finally {
      this.formulasLoaded.set(true);
    }
  }

  async confirmRegister() {
    if (!this.preview()?.ok) return;
    // Guarded here as well as by the disabled button: the API 400s without a formula, and a
    // clear local message beats a round trip that says the same thing.
    if (!this.selectedFormula()) {
      this.error.set('Select the class definition this asset is issued under.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.api.assetRegisterExisting(this.address().trim(), this.selectedFormula());
      if (!r || r.error) {
        this.error.set(r?.error || 'registerAsset failed.');
        return;
      }
      this.svc.confirm({ address: this.address().trim(), registered: true });
      this.reset();
    } catch (e: any) {
      this.error.set(e?.message || String(e));
    } finally {
      this.loading.set(false);
    }
  }

  cancel() {
    this.svc.cancel();
    this.reset();
  }

  private reset() {
    this.address.set('');
    this.preview.set(null);
    this.error.set('');
    this.formulas.set([]);
    this.formulasLoaded.set(false);
    this.selectedFormula.set('');
  }

  shortAddr(a?: string): string {
    return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
  }
}
