import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { ModalDocumentShareService } from './modal-document-share.service';
import { ApiService } from '../../../../../shared/services/api.service';

type Kind = 'entity' | 'regulator' | 'service' | 'subscription';

interface Candidate {
  address: string;
  name: string;
  type: Kind;
}

@Component({
  selector: 'app-modal-document-share',
  templateUrl: './modal-document-share.component.html',
  styleUrls: ['./modal-document-share.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslatePipe],
})
export class ModalDocumentShareComponent {
  shareService = inject(ModalDocumentShareService);
  private apiService = inject(ApiService);

  kind     = signal<Kind>('entity');
  query    = signal('');
  results  = signal<Candidate[]>([]);
  selected = signal<Candidate | null>(null);
  // Manual-entry fallback for addresses that aren't in the local mirror yet (or for cross-country
  // targets the search excludes). Kept behind an accordion to keep the default UX clean.
  manualMode = signal(false);
  manualAddress = signal('');
  searching = signal(false);

  isValid = computed(() => {
    if (this.manualMode()) return /^0x[a-fA-F0-9]{40}$/.test(this.manualAddress().trim());
    return this.selected() !== null;
  });

  constructor() {
    effect(() => {
      if (!this.shareService.isVisible()) {
        this.kind.set('entity');
        this.query.set('');
        this.results.set([]);
        this.selected.set(null);
        this.manualMode.set(false);
        this.manualAddress.set('');
      }
    });
  }

  setKind(k: Kind) {
    this.kind.set(k);
    this.selected.set(null);
    this.results.set([]);
    this.query.set('');
  }

  // The connect-recipients search is shared across messaging and document sharing — services were
  // added to the backend to support this second use case. Short-circuit on queries shorter than
  // two characters to avoid flooding the API on every keystroke.
  async search() {
    const q = this.query().trim();
    if (q.length < 2) { this.results.set([]); return; }
    this.searching.set(true);
    try {
      const resp = await this.apiService.connectRecipientsSearch(this.kind(), q);
      const rows: Candidate[] = (resp?.results || []).map((r: any) => ({
        address: r.address,
        name:    r.name || r.address,
        type:    this.kind(),
      }));
      this.results.set(rows);
    } finally {
      this.searching.set(false);
    }
  }

  pick(c: Candidate) {
    this.selected.set(this.selected()?.address === c.address ? null : c);
  }

  isPicked(c: Candidate): boolean {
    return this.selected()?.address === c.address;
  }

  toggleManual() {
    this.manualMode.set(!this.manualMode());
    this.selected.set(null);
    this.manualAddress.set('');
  }

  onSave(): void {
    if (!this.isValid()) return;
    const address = this.manualMode()
      ? this.manualAddress().trim()
      : this.selected()!.address;
    this.shareService.confirm(address);
  }

  onCancel(): void { this.shareService.cancel(); }
}
