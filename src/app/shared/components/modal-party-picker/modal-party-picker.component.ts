import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ApiService } from '../../services/api.service';
import { ModalPartyPickerService, PartyPickerCandidate } from './modal-party-picker.service';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';

@Component({
  selector: 'app-modal-party-picker',
  templateUrl: './modal-party-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [LoadingStateComponent, TranslatePipe],
})
export class ModalPartyPickerComponent {

  pickerService = inject(ModalPartyPickerService);
  private apiService = inject(ApiService);

  candidates = signal<PartyPickerCandidate[]>([]);
  isLoading = signal(false);
  loadError = signal('');
  requiresIndependence = signal(false);
  filter = signal('');
  selected = signal<string>('');

  filtered = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const rows = this.candidates();
    if (!q) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(q) || r.address.toLowerCase().includes(q));
  });

  selectedRow = computed(() =>
    this.candidates().find(r => r.address.toLowerCase() === this.selected().toLowerCase()) ?? null);

  constructor() {
    effect(() => {
      if (this.pickerService.isVisible()) {
        untracked(() => {
          this.filter.set('');
          this.selected.set('');
          this.loadError.set('');
          this.load();
        });
      }
    });
  }

  roleName(): string { return this.pickerService.request()?.roleName ?? ''; }

  async load() {
    const role = Number(this.pickerService.request()?.role ?? 0);
    if (!role) return;
    this.isLoading.set(true);
    try {
      const res: any = await this.apiService.assetClassProviders(role);
      this.candidates.set((res?.providers ?? []) as PartyPickerCandidate[]);
      this.requiresIndependence.set(res?.requiresIndependence === true);
      if (res?.error) this.loadError.set(res.error);
    } catch (e: any) {
      this.candidates.set([]);
      this.loadError.set(e?.error?.error || e?.message || '');
    } finally {
      this.isLoading.set(false);
    }
  }

  select(address: string) { this.selected.set(address); }

  onConfirm() {
    const row = this.selectedRow();
    if (!row) return;
    this.pickerService.confirm(row);
  }

  onCancel() { this.pickerService.cancel(); }
}
