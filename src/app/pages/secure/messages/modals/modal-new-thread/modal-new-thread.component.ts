import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { from, of } from 'rxjs';

import { ApiService } from '../../../../../shared/services/api.service';
import { ModalNewThreadService } from './modal-new-thread.service';

type Kind = 'entity' | 'regulator' | 'subscription';

const ZERO_HASH = '0x' + '0'.repeat(64);

interface Candidate {
  address: string;
  name: string;
  type: Kind;
  partyType: number;
  // Connect v2 handle targeting: a candidate can be a whole party OR a specific
  // user within an entity/regulator tenant (alice@entityX). `party` is the
  // messageable party address; `userId`/`handle` are set only for user picks.
  party?: string;
  userId?: string;
  handle?: string;
  isUser?: boolean;
}

@Component({
  selector: 'app-modal-new-thread',
  templateUrl: './modal-new-thread.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
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
  composeFiles = signal<File[]>([]);
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
        return from(this.runSearch(q));
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(rows => {
      this.searching.set(false);
      if (!rows) return;
      this.results.set(rows);
    });
  }

  // Entity/regulator kinds run a UNIFIED search — parties (whole tenants) AND
  // specific users (handles like alice@entityX) merged into one list.
  // Subscription kind stays party-only (subscriptions have no sub-users).
  private async runSearch(q: string): Promise<Candidate[]> {
    const k = this.kind();
    const pResp = await this.apiService.connectRecipientsSearch(k, q);
    const parties: Candidate[] = (pResp?.results || []).map((r: any) => ({
      address:   r.address,
      party:     r.address,
      name:      r.name || r.address,
      type:      k,
      partyType: this.kindToPartyType(k),
    }));
    if (k === 'subscription') return parties;
    const uResp = await this.apiService.connectRecipientsSearch('user', q.split('@')[0]);
    const users: Candidate[] = (uResp?.results || []).map((r: any) => ({
      address:   r.party,
      party:     r.party,
      userId:    r.userId,
      handle:    r.handle,
      name:      r.fullAddress || (r.handle + '@' + (r.partyName || r.party)),
      type:      k,
      partyType: this.kindToPartyType(k),
      isUser:    true,
    }));
    return [...parties, ...users];
  }

  onFilesSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = [...this.composeFiles(), ...Array.from(input.files || [])].slice(0, 10);
    this.composeFiles.set(files);
    input.value = '';
  }

  removeComposeFile(idx: number) {
    this.composeFiles.update(f => f.filter((_, i) => i !== idx));
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

  // Selection identity — a whole party and a specific user under the SAME party
  // are distinct picks, so the key folds in userId.
  keyOf(c: Candidate): string {
    return (c.party || c.address || '').toLowerCase() + '|' + (c.userId || '');
  }

  toggle(c: Candidate) {
    const key = this.keyOf(c);
    const cur = this.selected();
    if (cur.some(x => this.keyOf(x) === key)) {
      this.selected.set(cur.filter(x => this.keyOf(x) !== key));
      this.error.set('');
      return;
    }
    if (cur.length >= this.maxRecipients()) return;
    this.selected.set([...cur, c]);
    this.error.set('');
  }

  isSelected(c: Candidate): boolean {
    const key = this.keyOf(c);
    return this.selected().some(x => this.keyOf(x) === key);
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
    const files = this.composeFiles();
    const hasInitial = !!this.initialText() || files.length > 0;
    const handleKind = this.kind() === 'entity' || this.kind() === 'regulator';
    this.working.set(true);
    this.error.set('');
    this.stage.set(hasInitial ? 'Creating thread and sending initial message…' : 'Creating thread…');
    try {
      const body: any = {
        kind: this.kind(),
        subject: this.subject(),
        // Participants = distinct party addresses. A user pick (alice@entityX)
        // contributes its party as a participant.
        targets: [...new Set(sel.map(s => (s.party || s.address || '').toLowerCase()).filter(Boolean))],
      };
      if (hasInitial) {
        const im: any = { text: this.initialText(), contentType: 1 };
        // If ANY recipient is a specific user, the initial message targets each
        // pick explicitly (whole party ⇒ userId 0), making it a DM to those
        // users. Otherwise omit `to` for a reply-all to every participant.
        if (handleKind && sel.some(s => !!s.userId)) {
          im.to = sel.map(s => ({ party: (s.party || s.address), userId: s.userId || ZERO_HASH }));
        }
        body.initialMessage = im;
      }
      const resp = files.length > 0
        ? await this.apiService.connectThreadCreateMultipart(body, files)
        : await this.apiService.connectThreadCreate(body);
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
    this.composeFiles.set([]);
    this.error.set('');
    this.stage.set('');
    this.searching.set(false);
  }
}
