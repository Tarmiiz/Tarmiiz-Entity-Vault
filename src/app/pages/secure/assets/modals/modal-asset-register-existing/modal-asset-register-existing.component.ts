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

  private addressLooksValid(): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(this.address().trim());
  }

  async runPreview() {
    this.error.set('');
    this.preview.set(null);
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
      }
    } catch (e: any) {
      this.error.set(e?.message || String(e));
    } finally {
      this.loading.set(false);
    }
  }

  async confirmRegister() {
    if (!this.preview()?.ok) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.api.assetRegisterExisting(this.address().trim());
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
  }

  shortAddr(a?: string): string {
    return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
  }
}
