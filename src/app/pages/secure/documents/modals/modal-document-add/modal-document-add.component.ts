import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, DestroyRef } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { from, of } from 'rxjs';

import { AddDocumentData, ModalDocumentAddService } from './modal-document-add.service';
import { ApiService } from '../../../../../shared/services/api.service';

const DOC_TYPE_PUBLIC  = 1;
const DOC_TYPE_PRIVATE = 2;

type RecipientKind = 'entity' | 'regulator' | 'service' | 'subscription';

interface RecipientCandidate {
  address: string;
  name: string;
  type: RecipientKind;
}

@Component({
  selector: 'app-modal-document-add',
  templateUrl: './modal-document-add.component.html',
  styleUrls: ['./modal-document-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
})
export class ModalDocumentAddComponent {
  addService = inject(ModalDocumentAddService);
  private apiService = inject(ApiService);
  private destroyRef = inject(DestroyRef);

  title = signal('');
  description = signal('');
  fileType = signal('');
  documentType = signal<number>(DOC_TYPE_PRIVATE);
  documentState = signal<number>(1);
  selectedFile = signal<File | null>(null);

  // Recipient picker (mirrors the documents-tab pattern used on service/asset/subscription details).
  recipientKind = signal<RecipientKind>('entity');
  recipientQuery = signal('');
  recipientResults = signal<RecipientCandidate[]>([]);
  recipientSelected = signal<RecipientCandidate[]>([]);
  recipientSearching = signal(false);

  isPrivate = computed(() => this.documentType() === DOC_TYPE_PRIVATE);
  isValid = computed(() => !!this.selectedFile() && this.title().trim().length > 0);

  constructor() {
    effect(() => {
      if (!this.addService.isVisible()) {
        this.title.set('');
        this.description.set('');
        this.fileType.set('');
        this.documentType.set(DOC_TYPE_PRIVATE);
        this.documentState.set(1);
        this.selectedFile.set(null);
        this.resetRecipientPicker();
      }
    });

    toObservable(this.recipientQuery).pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(q => {
        if (!q || q.length < 2) {
          this.recipientResults.set([]);
          this.recipientSearching.set(false);
          return of(null);
        }
        this.recipientSearching.set(true);
        return from(this.apiService.connectRecipientsSearch(this.recipientKind(), q));
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(resp => {
      this.recipientSearching.set(false);
      if (!resp) return;
      const kind = this.recipientKind();
      const rows: RecipientCandidate[] = (resp?.results || []).map((r: any) => ({
        address: r.address,
        name:    r.name || r.address,
        type:    kind,
      }));
      this.recipientResults.set(rows);
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile.set(file);
    if (file) {
      this.fileType.set(file.type || '');
      if (!this.title().trim()) {
        const base = file.name.replace(/\.[^.]+$/, '');
        this.title.set(base);
      }
    }
    input.value = '';
  }

  private resetRecipientPicker() {
    this.recipientKind.set('entity');
    this.recipientQuery.set('');
    this.recipientResults.set([]);
    this.recipientSelected.set([]);
    this.recipientSearching.set(false);
  }

  setRecipientKind(k: RecipientKind) {
    this.recipientKind.set(k);
    this.recipientResults.set([]);
    this.recipientQuery.set('');
  }

  toggleRecipient(c: RecipientCandidate) {
    const cur = this.recipientSelected();
    if (cur.some(x => x.address === c.address)) {
      this.recipientSelected.set(cur.filter(x => x.address !== c.address));
      return;
    }
    this.recipientSelected.set([...cur, c]);
  }

  isRecipientSelected(c: RecipientCandidate): boolean {
    return this.recipientSelected().some(x => x.address === c.address);
  }

  recipientKindBadgeClass(k: RecipientKind): string {
    switch (k) {
      case 'entity':       return 'bg-blue-100 text-blue-800';
      case 'regulator':    return 'bg-purple-100 text-purple-800';
      case 'service':      return 'bg-amber-100 text-amber-800';
      case 'subscription': return 'bg-green-100 text-green-800';
      default:             return 'bg-gray-100 text-gray-700';
    }
  }

  recipientKindLabel(k: RecipientKind): string {
    return k.charAt(0).toUpperCase() + k.slice(1);
  }

  onSave(): void {
    const file = this.selectedFile();
    if (!file || !this.isValid()) return;

    const sharedWith = this.isPrivate()
      ? this.recipientSelected().map(r => r.address)
      : [];

    const data: AddDocumentData = {
      file,
      title:         this.title().trim(),
      description:   this.description().trim(),
      fileType:      file.type || '',
      documentType:  this.documentType(),
      documentState: this.documentState(),
      sharedWith,
    };
    this.addService.confirm(data);
  }

  onCancel(): void {
    this.addService.cancel();
  }
}
