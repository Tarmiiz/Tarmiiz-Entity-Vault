import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalAssetAddServiceService } from './modal-asset-add-service.service';
import { ApiService } from '../../../../../shared/services/api.service';

interface Candidate {
  address: string;
  name: string;
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
      const resp = await this.apiService.vaultGetServicesOwn(0, 200);
      const attached = new Set(this.addServiceModal.currentServices().map(a => a.toLowerCase()));
      const all = ((resp?.services || []) as any[])
        // ⚠️ WAS `service_type === 1` (Phase 28 step (e)). That column is GONE from
        // `services_view`, so the old test would have read `Number(undefined) === 1` —
        // NaN, always false — and emptied this picker SILENTLY. Token-issuer now means
        // holding an ACTIVE Token Issuer licence (class 27).
        //
        // 🔴 EMPTY UNTIL THE LICENCE READ ROUTE LANDS (licensing lane): `licenses` is
        // populated by nothing yet, so this picker is empty either way TODAY. The
        // difference is that it now fails for a stated reason rather than by accident.
        .filter((s: any) => ((s.licenses ?? []) as number[]).includes(27))
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
      if (data) {
        this.lookedUpService.set({
          address:   data.address,
          name:      data.name ?? data.address,
          state:     data.state,
          stateName: data.state_name ?? String(data.state),
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
