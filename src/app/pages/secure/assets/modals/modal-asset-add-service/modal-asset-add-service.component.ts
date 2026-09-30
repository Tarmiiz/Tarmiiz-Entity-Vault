import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalAssetAddServiceService } from './modal-asset-add-service.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { AuthService } from '../../../../../shared/services/auth.service';

// The Directory's party type for a SERVICE (Directory.sol: 1 regulator, 2 entity, 3 identity, 4 service, …).
const DIR_SERVICE = 4;

interface Candidate {
  address: string;
  name: string;
  /** true = another entity's service, found in the public Directory (a distributor, typically). */
  foreign?: boolean;
}

interface ServicePreview {
  address: string;
  name: string;
  state: number;
  stateName: string;
}

@Component({
  selector: 'app-modal-asset-add-service',
  templateUrl: './modal-asset-add-service.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslatePipe],
})
export class ModalAssetAddServiceComponent {

  addServiceModal = inject(ModalAssetAddServiceService);
  private apiService = inject(ApiService);
  private authService = inject(AuthService);

  query    = signal('');
  results  = signal<Candidate[]>([]);
  selected = signal<Candidate | null>(null);
  searching = signal(false);

  manualMode    = signal(false);
  manualAddress = signal('');

  lookedUpService = signal<ServicePreview | null>(null);
  lookupError     = signal<string | null>(null);
  isLooking       = signal(false);

  isValid = computed(() => this.lookedUpService() !== null);

  constructor() {
    effect(() => {
      if (!this.addServiceModal.isVisible()) {
        this.query.set('');
        this.results.set([]);
        this.selected.set(null);
        this.manualMode.set(false);
        this.manualAddress.set('');
        this.lookedUpService.set(null);
        this.lookupError.set(null);
      }
    });
  }

  async search() {
    const q = this.query().trim().toLowerCase();
    this.searching.set(true);
    try {
      // ⚠️ OWN SERVICES ONLY until 2026-09-30, and the MANUAL path read our own mirror too, so a DISTRIBUTOR —
      // by definition another entity's service — could not be added from this modal at all: its address
      // searched to "No matches" and looked up to "Service not found" (user report, NI Capital adding Telda
      // App to SIULA). The chain accepts any service; only this picker refused. Foreign services now come
      // from the PUBLIC Directory of this entity's country (a hidden service stays reachable by address).
      await this.authService.ensureEntityInfo().catch(() => {});
      const country = Number(this.authService.entityInfo?.countryCode) || 0;
      const [resp, dir] = await Promise.all([
        this.apiService.vaultGetServicesOwn(0, 200),
        country ? this.apiService.vaultDirectoryList(country, DIR_SERVICE).catch(() => []) : Promise.resolve([]),
      ]);
      const attached = new Set(this.addServiceModal.currentServices().map(a => a.toLowerCase()));
      const all = ((resp?.services || []) as any[])
        // ⚠️ WAS `service_type === 1` (Phase 28 step (e)). That column is GONE from
        // `services_view`, so the old test would have read `Number(undefined) === 1` —
        // NaN, always false — and emptied this picker SILENTLY. Token-issuer now means
        // holding an ACTIVE Token Issuer license (class 27).
        //
        // ⚠️ THE FIELD IS `license_class_ids`, NOT `licenses` (corrected 2026-09-15).
        // Reading `s.licenses` was the SAME silent-empty defect one word further on:
        // `services_view` has no licence column at all — `getServices` grafts the active
        // set onto each row in JS as `license_class_ids` (Entity API db.js:2349-2368), so
        // `s.licenses` was `undefined` and this picker stayed permanently empty.
        // The comment here used to say it was "EMPTY UNTIL THE LICENSE READ ROUTE LANDS";
        // that route HAS landed, which is exactly why a stale blocker note is worse than
        // none — it tells the next reader the emptiness is expected.
        .filter((s: any) => ((s.license_class_ids ?? []) as number[]).includes(27))
        .filter(s => !attached.has((s.address || '').toLowerCase()));
      const filtered = q
        ? all.filter(s =>
            (s.name || '').toLowerCase().includes(q) ||
            (s.address || '').toLowerCase().includes(q))
        : all;
      const rows: Candidate[] = filtered.map(s => ({
        address: s.address,
        name:    s.name || s.address,
      }));
      const ours = new Set(((resp?.services || []) as any[]).map(s => (s.address || '').toLowerCase()));
      for (const e of dir) {
        const a = (e.target || '').toLowerCase();
        if (!e.active || ours.has(a) || attached.has(a)) continue;
        if (q && !(e.name || '').toLowerCase().includes(q) && !a.includes(q)) continue;
        rows.push({ address: e.target, name: e.name || e.target, foreign: true });
      }
      this.results.set(rows);
    } finally {
      this.searching.set(false);
    }
  }

  async pick(c: Candidate) {
    if (this.selected()?.address === c.address) {
      this.selected.set(null);
      this.lookedUpService.set(null);
      this.lookupError.set(null);
      return;
    }
    this.selected.set(c);
    await this.resolveAddress(c.address);
  }

  isPicked(c: Candidate): boolean {
    return this.selected()?.address === c.address;
  }

  toggleManual() {
    this.manualMode.set(!this.manualMode());
    this.selected.set(null);
    this.manualAddress.set('');
    this.lookedUpService.set(null);
    this.lookupError.set(null);
  }

  async onLookup() {
    const addr = this.manualAddress().trim();
    if (!addr) return;
    await this.resolveAddress(addr);
  }

  private async resolveAddress(address: string) {
    const current = this.addServiceModal.currentServices();
    if (current.includes(address)) {
      this.lookupError.set('This service is already associated with the asset.');
      this.lookedUpService.set(null);
      return;
    }

    this.isLooking.set(true);
    this.lookedUpService.set(null);
    this.lookupError.set(null);

    try {
      const data = await this.apiService.vaultGetService(address);
      // Not ours ⇒ the mirror has no row; ask the Directory, which names every registered service.
      const dir = data ? null : await this.apiService.vaultDirectoryByAddress(address).catch(() => null);
      if (data) {
        this.lookedUpService.set({
          address:   data.address,
          name:      data.name ?? data.address,
          state:     data.state,
          stateName: data.state_name ?? String(data.state),
        });
      } else if (dir && Number(dir.partyType) === DIR_SERVICE) {
        this.lookedUpService.set({
          address:   dir.target,
          name:      dir.name || dir.target,
          state:     dir.active ? 2 : 4,
          stateName: dir.active ? 'Active' : 'Inactive',
        });
      } else {
        this.lookupError.set('Service not found. Please check the address and try again.');
      }
    } finally {
      this.isLooking.set(false);
    }
  }

  onConfirm(): void {
    const svc = this.lookedUpService();
    if (svc) {
      this.addServiceModal.confirm(svc.address);
    }
  }

  onCancel(): void {
    this.addServiceModal.cancel();
  }
}
