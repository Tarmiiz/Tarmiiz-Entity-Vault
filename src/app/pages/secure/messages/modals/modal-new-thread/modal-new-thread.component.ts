import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { ApiService } from '../../../../../shared/services/api.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { ModalNewThreadService } from './modal-new-thread.service';

type Kind = 'entity' | 'regulator' | 'subscription';

interface Candidate {
  address: string;
  name: string;
  type: Kind;
}

@Component({
  selector: 'app-modal-new-thread',
  templateUrl: './modal-new-thread.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalNewThreadComponent {
  modalService = inject(ModalNewThreadService);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);

  kind         = signal<Kind>('entity');
  query        = signal('');
  results      = signal<Candidate[]>([]);
  selected     = signal<Candidate[]>([]);
  subject      = signal('');
  initialText  = signal('');
  working      = signal(false);
  error        = signal('');

  setKind(k: Kind) {
    this.kind.set(k);
    this.selected.set([]);
    this.results.set([]);
    this.query.set('');
    this.error.set('');
  }

  async search() {
    this.error.set('');
    const q = this.query();
    if (!q || q.length < 2) { this.results.set([]); return; }
    const resp = await this.apiService.connectRecipientsSearch(this.kind(), q);
    const rows: Candidate[] = (resp?.results || []).map((r: any) => ({
      address: r.address,
      name:    r.name || r.address,
      type:    this.kind(),
    }));
    this.results.set(rows);
  }

  toggle(c: Candidate) {
    const cur = this.selected();
    if (cur.some(x => x.address === c.address)) {
      this.selected.set(cur.filter(x => x.address !== c.address));
    } else {
      if ((this.kind() === 'entity' || this.kind() === 'regulator') && cur.length >= 1) {
        this.error.set(this.kind() + ' threads are 1:1 — only one recipient.');
        return;
      }
      if (this.kind() === 'subscription' && cur.length >= 9) {
        this.error.set('Max 9 subscription participants per thread.');
        return;
      }
      this.selected.set([...cur, c]);
    }
  }

  isSelected(c: Candidate): boolean {
    return this.selected().some(x => x.address === c.address);
  }

  async create() {
    const sel = this.selected();
    if (sel.length === 0) { this.error.set('Pick at least one recipient.'); return; }
    this.working.set(true);
    this.error.set('');
    this.loadingService.show(this.initialText() ? 'Creating thread and sending message...' : 'Creating thread...');
    try {
      const body: any = {
        kind: this.kind(),
        subject: this.subject(),
        targets: sel.map(s => s.address),
      };
      if (this.initialText()) {
        if (this.kind() === 'subscription') {
          body.initialMessage = { subscriptionAddr: sel[0].address, text: this.initialText(), contentType: 1 };
        } else {
          body.initialMessage = { recipient: sel[0].address, text: this.initialText(), contentType: 1 };
        }
      }
      const resp = await this.apiService.connectThreadCreate(body);
      if (resp?.threadId != null) {
        this.modalService.confirm({ threadId: resp.threadId });
        this.reset();
      } else {
        this.error.set(resp?.error || 'Failed to create thread.');
      }
    } finally {
      this.working.set(false);
      this.loadingService.hide();
    }
  }

  cancel() {
    this.modalService.cancel();
    this.reset();
  }

  private reset() {
    this.kind.set('entity');
    this.query.set('');
    this.results.set([]);
    this.selected.set([]);
    this.subject.set('');
    this.initialText.set('');
    this.error.set('');
  }
}
