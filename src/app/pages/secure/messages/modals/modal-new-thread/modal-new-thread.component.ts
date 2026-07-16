import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { from, of } from 'rxjs';

import { ApiService } from '../../../../../shared/services/api.service';
import { ModalNewThreadService } from './modal-new-thread.service';

type Kind = 'entity' | 'regulator' | 'subscription';

interface Candidate {
  address: string;
  name: string;
  type: Kind;
  partyType: number;
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
  private destroyRef = inject(DestroyRef);

  kind         = signal<Kind>('entity');
  query        = signal('');
  results      = signal<Candidate[]>([]);
  selected     = signal<Candidate[]>([]);
  subject      = signal('');
  initialText  = signal('');
  working      = signal(false);
  stage        = signal('');
  error        = signal('');
  searching    = signal(false);

  // Connect v2: threads take up to 100 participants (self + 99 others), any kind.
  maxRecipients = computed(() => 99);
  atCapacity    = computed(() => this.selected().length >= this.maxRecipients());

  constructor() {
    toObservable(this.query).pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(q => {
        if (!q || q.length < 2) {
          this.results.set([]);
          this.searching.set(false);
          return of(null);
        }
        this.searching.set(true);
        return from(this.apiService.connectRecipientsSearch(this.kind(), q));
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(resp => {
      this.searching.set(false);
      if (!resp) return;
      const partyType = this.kindToPartyType(this.kind());
      const rows: Candidate[] = (resp?.results || []).map((r: any) => ({
        address: r.address,
        name:    r.name || r.address,
        type:    this.kind(),
        partyType,
      }));
      this.results.set(rows);
    });
  }

  private kindToPartyType(k: Kind): number {
    return k === 'entity' ? 2 : k === 'regulator' ? 3 : 4;
  }

  setKind(k: Kind) {
    this.kind.set(k);
    this.selected.set([]);
    this.results.set([]);
    this.query.set('');
    this.error.set('');
  }

  toggle(c: Candidate) {
    const cur = this.selected();
    if (cur.some(x => x.address === c.address)) {
      this.selected.set(cur.filter(x => x.address !== c.address));
      this.error.set('');
      return;
    }
    if (cur.length >= this.maxRecipients()) return;
    this.selected.set([...cur, c]);
    this.error.set('');
  }

  isSelected(c: Candidate): boolean {
    return this.selected().some(x => x.address === c.address);
  }

  partyTypeLabel(pt: number): string {
    return pt === 1 ? 'Identity' : pt === 2 ? 'Entity' : pt === 3 ? 'Regulator' : pt === 4 ? 'Subscription' : '—';
  }

  partyTypeBadgeClass(pt: number): string {
    return pt === 1 ? 'bg-gray-100 text-gray-700'
         : pt === 2 ? 'bg-blue-100 text-blue-800'
         : pt === 3 ? 'bg-purple-100 text-purple-800'
         : pt === 4 ? 'bg-green-100 text-green-800'
         : 'bg-gray-100 text-gray-600';
  }

  async create() {
    const sel = this.selected();
    if (sel.length === 0) { this.error.set('Pick at least one recipient.'); return; }
    this.working.set(true);
    this.error.set('');
    this.stage.set(this.initialText() ? 'Creating thread and sending initial message…' : 'Creating thread…');
    try {
      const body: any = {
        kind: this.kind(),
        subject: this.subject(),
        targets: sel.map(s => s.address),
      };
      if (this.initialText()) {
        // v2: the initial message goes to ALL participants (on-chain snapshot).
        body.initialMessage = { text: this.initialText(), contentType: 1 };
      }
      const resp = await this.apiService.connectThreadCreate(body);
      if (resp?.threadId != null) {
        this.stage.set('');
        this.modalService.confirm({ threadId: resp.threadId });
        this.reset();
      } else {
        this.error.set(resp?.error || 'Failed to create thread.');
        this.stage.set('');
      }
    } finally {
      this.working.set(false);
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
    this.stage.set('');
    this.searching.set(false);
  }
}
