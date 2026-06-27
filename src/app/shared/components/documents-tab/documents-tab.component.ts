import {
  Component, Input, OnChanges, SimpleChanges, DestroyRef,
  ChangeDetectionStrategy, inject, signal, computed
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { from, of } from 'rxjs';

import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../alerts/alert/alert.service';
import { LoadingService } from '../alerts/loading/loading.service';
import { UtilsService } from '../../services/utils.service';
import { Document } from '../../models/data.model';
import { ModalDocumentShareService } from '../../../pages/secure/documents/modals/modal-document-share/modal-document-share.service';
import { ModalDocumentShareComponent } from '../../../pages/secure/documents/modals/modal-document-share/modal-document-share.component';
import { ModalDocumentSignService } from '../../../pages/secure/documents/modals/modal-document-sign/modal-document-sign.service';
import { ModalDocumentSignComponent } from '../../../pages/secure/documents/modals/modal-document-sign/modal-document-sign.component';

type ResourceType = 'service' | 'asset' | 'subscription';
type RecipientKind = 'entity' | 'regulator' | 'service' | 'subscription';

interface RecipientCandidate {
  address: string;
  name: string;
  type: RecipientKind;
}

type DocFormMode = 'add' | 'edit' | 'view';

interface DocFormState {
  mode: DocFormMode;
  doc: Document | null;
}

const DOC_TYPE_PUBLIC  = 1;
const DOC_TYPE_PRIVATE = 2;
// DirectoryProxy party types: 2=Entity, 3=Regulator, 4=Service, 5=Subscription.
const DIR_PARTY_REGULATOR = 3;

// Placeholder painted into the new tab while a document loads, so it doesn't read as an
// accidental blank popup during the (potentially multi-second) IPFS fetch.
const DOC_LOADING_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Loading document…</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#475569;background:#f8fafc}
  .spinner{width:38px;height:38px;border:4px solid #e2e8f0;border-top-color:#2563eb;border-radius:50%;
           animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p{margin:0;font-size:15px}
</style></head>
<body><div class="spinner"></div><p>Loading document…</p></body></html>`;

// A document a foreign party (e.g. a regulator) shared directly with THIS template (the service /
// asset / subscription this tab is showing). Read-only here; the owner holds the doc.
interface InboundDoc {
  documentId: number;
  owner: string;
  ownerName: string;
  ownerPartyType: number;
  title: string;
  cid: string;
  documentType: number;
  documentState: number;
  createdAt: number;
  sharedAt: number;
  signed: boolean;
}

@Component({
  selector: 'app-documents-tab',
  templateUrl: './documents-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, ModalDocumentShareComponent, ModalDocumentSignComponent],
})
export class DocumentsTabComponent implements OnChanges {
  @Input() resourceType!: ResourceType;
  @Input() address!: string;
  @Input() entityActive = true;

  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private shareModal = inject(ModalDocumentShareService);
  private signModal = inject(ModalDocumentSignService);
  private destroyRef = inject(DestroyRef);
  utils = inject(UtilsService);

  // Only executive (role 2) users hold signer keys → only they can sign a regulator's inbound doc.
  isExecutive = () => Number(this.authService.userInfo?.role) === 2;

  // Documents a foreign party shared directly with THIS template (inbound, read-only).
  inboundDocs = signal<InboundDoc[]>([]);

  // Current recipients for the document open in the view modal. Refreshed each time View opens
  // and after every share / unshare so the list stays in sync with on-chain state.
  sharedWith = signal<string[]>([]);
  // Resolved name + kind per shared-with address. Missing entries render as the raw address.
  sharedWithDirectory = signal<Record<string, { name: string; partyType: number } | null>>({});

  documents = signal<Document[]>([]);
  signedCounts = signal<Record<number, number>>({});
  loading = signal(false);

  filterTitle = signal('');
  filterType = signal('');

  filteredDocs = computed(() => {
    const t = this.filterTitle().toLowerCase().trim();
    const dt = this.filterType();
    return this.documents().filter(d =>
      (!t || d.title.toLowerCase().includes(t) || d.description?.toLowerCase().includes(t)) &&
      (!dt || String(d.documentType) === dt) &&
      d.documentState !== 2
    );
  });

  // Modal state
  modalVisible = signal(false);
  formState = signal<DocFormState>({ mode: 'add', doc: null });

  formTitle = signal('');
  formDescription = signal('');
  // Documents are now Public (1) or Private (2) only. Regulator (3) was retired in the redesign.
  formType = signal<number>(DOC_TYPE_PRIVATE);
  formUploadProgress = signal<number | null>(null);
  formSelectedFile = signal<File | null>(null);

  // Recipient picker state (mirrors the pattern used by the messages "New thread" modal).
  recipientKind = signal<RecipientKind>('entity');
  recipientQuery = signal('');
  recipientResults = signal<RecipientCandidate[]>([]);
  recipientSelected = signal<RecipientCandidate[]>([]);
  recipientSearching = signal(false);

  // Add: file required. Edit: title required (no file re-upload — clients must delete + re-add to
  // replace a file because the old CID can't be re-encrypted without decrypting first).
  isFormValid = computed(() => {
    const mode = this.formState().mode;
    const hasTitle = this.formTitle().trim().length > 0;
    if (mode === 'add') return hasTitle && this.formSelectedFile() !== null;
    if (mode === 'edit') return hasTitle;
    return false;
  });

  readonly docTypeNames: Record<number, string> = {
    [DOC_TYPE_PUBLIC]:  'Public',
    [DOC_TYPE_PRIVATE]: 'Private',
  };

  getDocTypeClass(type: number): string {
    switch (type) {
      case DOC_TYPE_PUBLIC:  return 'bg-blue-100 text-blue-800';
      case DOC_TYPE_PRIVATE: return 'bg-yellow-100 text-yellow-800';
      default:               return 'bg-gray-100 text-gray-800';
    }
  }

  isPrivate = computed(() => this.formType() === DOC_TYPE_PRIVATE);

  constructor() {
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

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['address'] || changes['resourceType']) && this.address && this.resourceType) {
      this.loadDocuments();
    }
  }

  async loadDocuments() {
    this.loading.set(true);
    try {
      let data: any;
      if (this.resourceType === 'service') {
        data = await this.apiService.serviceDocumentsList(this.address, 1, 200);
      } else if (this.resourceType === 'asset') {
        data = await this.apiService.assetDocumentsList(this.address, 1, 200);
      } else {
        data = await this.apiService.subscriptionDocumentsList(this.address, 1, 200);
      }
      const docs: Document[] = (data?.documents ?? []).map((r: any) => this.mapDoc(r));
      this.documents.set(docs);
      this.loadSignedCounts(docs);
      this.loadInbound();
    } finally {
      this.loading.set(false);
    }
  }

  // Docs a foreign party (e.g. a regulator) shared directly with this template. Read AS this template
  // server-side (double-hop), so the entity's missing ACL membership doesn't block the read.
  async loadInbound() {
    this.inboundDocs.set([]);
    try {
      const res = await this.apiService.inboundDocumentsList(this.address);
      const rows: any[] = res?.documents ?? [];
      if (!rows.length) return;

      // Resolve each distinct owner's directory name/party-type and (when a regulator) which of its
      // docs THIS tenant has already signed — one submissions call per owner, not per doc.
      const owners = Array.from(new Set(rows.map(r => String(r.owner).toLowerCase())));
      const dirMap: Record<string, { name: string; partyType: number }> = {};
      const signedSets: Record<string, Set<number>> = {};
      await Promise.all(owners.map(async (o) => {
        try {
          const entry = await this.apiService.vaultDirectoryByAddress(o);
          if (entry) dirMap[o] = { name: entry.name, partyType: Number(entry.partyType || 0) };
        } catch { /* not in directory */ }
        try {
          const sub = await this.apiService.regulatorSubmissionsList(o, 1, 500);
          signedSets[o] = new Set<number>((sub?.signatures ?? []).map((s: any) => Number(s.documentId)));
        } catch { signedSets[o] = new Set<number>(); }
      }));

      const docs: InboundDoc[] = rows.map(r => {
        const owner = String(r.owner).toLowerCase();
        const id = Number(r.documentId ?? r.id);
        return {
          documentId:     id,
          owner,
          ownerName:      dirMap[owner]?.name ?? owner,
          ownerPartyType: dirMap[owner]?.partyType ?? 0,
          title:          r.title ?? '',
          cid:            r.cid ?? '',
          documentType:   Number(r.documentType ?? DOC_TYPE_PRIVATE),
          documentState:  Number(r.documentState ?? 1),
          createdAt:      Number(r.createdAt ?? 0),
          sharedAt:       Number(r.sharedAt ?? 0),
          signed:         signedSets[owner]?.has(id) ?? false,
        } as InboundDoc;
      });
      this.inboundDocs.set(docs);
    } catch { this.inboundDocs.set([]); }
  }

  inboundKindLabel(t: number): string {
    switch (t) {
      case 2: return 'Entity';
      case 3: return 'Regulator';
      case 4: return 'Service';
      case 5: return 'Subscription';
      default: return '';
    }
  }
  inboundKindBadgeClass(t: number): string {
    switch (t) {
      case 2: return 'bg-blue-100 text-blue-800';
      case 3: return 'bg-purple-100 text-purple-800';
      case 4: return 'bg-amber-100 text-amber-800';
      case 5: return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  // Signing only applies to a regulator's inbound doc (submitSignature targets a RegulatorTemplate),
  // while the doc is active, by an executive who hasn't already signed it.
  canSignInbound(doc: InboundDoc): boolean {
    return doc.ownerPartyType === DIR_PARTY_REGULATOR && doc.documentState === 1 && this.isExecutive() && !doc.signed;
  }

  async viewInbound(doc: InboundDoc) {
    const win = this._claimTab();   // claim the tab inside the click gesture
    this.loadingService.show('Fetching file...');
    try {
      const fetched = await this.apiService.inboundDocumentFetchFile(this.address, doc.owner, doc.documentId);
      if (!this._revealInTab(win, fetched)) {
        this.alertService.show('Error', 'Could not fetch the shared file.');
      }
    } finally {
      this.loadingService.hide();
    }
  }

  /**
   * Open a tab synchronously within the click gesture and paint a "Loading…" placeholder into
   * it. Must be called before the (multi-second) fetch await, or the popup blocker drops a
   * deferred window.open() once the gesture window has elapsed. The placeholder makes the
   * otherwise-blank tab visibly intentional while the file loads.
   */
  private _claimTab(): Window | null {
    const win = window.open('', '_blank');
    if (win) {
      try { win.document.write(DOC_LOADING_HTML); win.document.close(); }
      catch { /* some browsers disallow writing the new doc — harmless, tab just stays blank */ }
    }
    return win;
  }

  /**
   * Reveal a fetched blob in a tab that was opened *synchronously* with the user's click.
   * The IPFS fetch can take several seconds for large files; a window.open() deferred until
   * after that await lands outside the user-gesture window and is silently dropped by the
   * popup blocker. So callers open the tab first, then hand it here to navigate.
   */
  private _revealInTab(win: Window | null, fetched: { blobUrl: string } | null): boolean {
    if (!fetched) { if (win) win.close(); return false; }
    if (win) {
      win.location.href = fetched.blobUrl;
    } else {
      // popup blocked outright — last-resort attempt (no worse than before)
      window.open(fetched.blobUrl, '_blank');
    }
    setTimeout(() => URL.revokeObjectURL(fetched.blobUrl), 60_000);
    return true;
  }

  // Sign a regulator's inbound doc: hash the decrypted plaintext (SHA-256) and submit the signature
  // back to the regulator via the entity's signer key — same flow as the entity-level shared-details
  // page (POST /regulator/documents/:id/sign → RegulatorTemplate.submitSignature via callExternal).
  async signInbound(doc: InboundDoc) {
    if (!this.canSignInbound(doc)) return;
    const keyId = await this.signModal.show();
    if (keyId === null) return;
    this.loadingService.show('Hashing file + signing...');
    try {
      const fetched = await this.apiService.inboundDocumentFetchFile(this.address, doc.owner, doc.documentId);
      if (!fetched) { this.alertService.show('Error', 'Could not fetch the shared file.'); return; }
      let buf: ArrayBuffer;
      try { buf = await (await fetch(fetched.blobUrl)).arrayBuffer(); }
      finally { URL.revokeObjectURL(fetched.blobUrl); }
      const digest  = await crypto.subtle.digest('SHA-256', buf);
      const docHash = '0x' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');

      const r = await this.apiService.regulatorDocumentSign(String(doc.documentId), doc.owner, String(keyId), docHash, doc.title || '');
      // authPost returns null on any non-2xx (e.g. 403) — treat null OR an error body as failure.
      if (!r || r.error) {
        this.alertService.show('Signing failed', r?.error || 'The signature could not be submitted. Please try again.', 'OK', 'max-w-md', true);
        return;
      }
      this.alertService.show('Document signed', 'Your signature was submitted to the regulator.', 'OK', 'max-w-md', true);
      await this.loadInbound();
    } finally {
      this.loadingService.hide();
    }
  }

  private async loadSignedCounts(docs: Document[]) {
    this.signedCounts.set({});
    await Promise.all(docs.map(async d => {
      let res: any = null;
      if (this.resourceType === 'service') {
        res = await this.apiService.serviceDocumentSignatures(this.address, d.id, 1, 1);
      } else if (this.resourceType === 'asset') {
        res = await this.apiService.assetDocumentSignatures(this.address, d.id, 1, 1);
      } else {
        res = await this.apiService.subscriptionDocumentSignatures(this.address, d.id, 1, 1);
      }
      const count = Number(res?.count ?? 0);
      this.signedCounts.update(m => ({ ...m, [d.id]: count }));
    }));
  }

  private mapDoc(r: any): Document {
    return new Document(
      r.id ?? r.documentId,
      r.cid ?? '',
      r.title ?? '',
      r.description ?? '',
      r.file_type ?? r.fileType ?? '',
      r.document_type ?? r.documentType ?? DOC_TYPE_PRIVATE,
      r.document_state ?? r.documentState ?? 1,
      r.owner ?? r.addedBy ?? '',
      r.created_by_user_id ?? r.createdByUserId ?? 0,
      r.created_at ?? r.createdAt ?? 0,
      r.updated_at ?? r.lastModified ?? r.updatedAt ?? 0,
      this.docTypeNames[r.document_type ?? r.documentType ?? DOC_TYPE_PRIVATE],
      (r.document_state ?? r.documentState) === 1 ? 'Active' : 'Deleted',
    );
  }

  clearFilters() {
    this.filterTitle.set('');
    this.filterType.set('');
  }

  private resetRecipientPicker() {
    this.recipientKind.set('entity');
    this.recipientQuery.set('');
    this.recipientResults.set([]);
    this.recipientSelected.set([]);
    this.recipientSearching.set(false);
  }

  openAdd() {
    this.formTitle.set('');
    this.formDescription.set('');
    this.formType.set(DOC_TYPE_PRIVATE);
    this.formSelectedFile.set(null);
    this.formUploadProgress.set(null);
    this.resetRecipientPicker();
    this.formState.set({ mode: 'add', doc: null });
    this.modalVisible.set(true);
  }

  openEdit(doc: Document) {
    this.formTitle.set(doc.title);
    this.formDescription.set(doc.description ?? '');
    this.formType.set(doc.documentType);
    this.formSelectedFile.set(null);
    this.formUploadProgress.set(null);
    this.resetRecipientPicker();
    this.formState.set({ mode: 'edit', doc });
    this.modalVisible.set(true);
  }

  openView(doc: Document) {
    this.formState.set({ mode: 'view', doc });
    this.formTitle.set(doc.title);
    this.formDescription.set(doc.description ?? '');
    this.formType.set(doc.documentType);
    this.formSelectedFile.set(null);
    this.formUploadProgress.set(null);
    this.resetRecipientPicker();
    this.sharedWith.set([]);
    this.modalVisible.set(true);
    // Private docs can have recipients; Public docs cannot (shareDocument reverts on-chain).
    if (doc.documentType === DOC_TYPE_PRIVATE) this.loadSharedWith(doc);
  }

  private async loadSharedWith(doc: Document) {
    let res: any = null;
    if (this.resourceType === 'service') {
      res = await this.apiService.serviceDocumentGetSharedWith(this.address, doc.id);
    } else if (this.resourceType === 'asset') {
      res = await this.apiService.assetDocumentGetSharedWith(this.address, doc.id);
    } else {
      res = await this.apiService.subscriptionDocumentGetSharedWith(this.address, doc.id);
    }
    const accounts: string[] = res?.accounts ?? [];
    this.sharedWith.set(accounts);
    this.sharedWithDirectory.set({});
    await Promise.all(accounts.map(async a => {
      const entry = await this.apiService.vaultDirectoryByAddress(a);
      if (entry) {
        this.sharedWithDirectory.update(m => ({ ...m, [a.toLowerCase()]: { name: entry.name, partyType: entry.partyType } }));
      }
    }));
  }

  sharedWithLabel(address: string): string {
    const entry = this.sharedWithDirectory()[address.toLowerCase()];
    return entry?.name ?? address;
  }

  // The document owner is included in sharedWith because the API wraps the DEK
  // for the uploader's own address so they can still read the document. Revoking
  // it would lock the owner out — don't expose that option.
  isSelfShare(address: string): boolean {
    const owner = this.formState().doc?.owner;
    if (!owner || !address) return false;
    return owner.toLowerCase() === address.toLowerCase();
  }

  sharedWithKindLabel(address: string): string {
    const entry = this.sharedWithDirectory()[address.toLowerCase()];
    if (!entry) return '';
    switch (entry.partyType) {
      case 2: return 'Entity';
      case 3: return 'Regulator';
      case 4: return 'Service';
      case 5: return 'Subscription';
      default: return '';
    }
  }

  sharedWithKindBadgeClass(address: string): string {
    const entry = this.sharedWithDirectory()[address.toLowerCase()];
    if (!entry) return 'bg-gray-100 text-gray-700';
    switch (entry.partyType) {
      case 2: return 'bg-blue-100 text-blue-800';
      case 3: return 'bg-purple-100 text-purple-800';
      case 4: return 'bg-amber-100 text-amber-800';
      case 5: return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  // Shares a Private document with a new recipient. API does the RSA rewrap with the recipient's
  // on-chain encryptionPublicKey; failure usually means the target hasn't published a key yet.
  async shareDocument(doc: Document) {
    if (doc.documentType !== DOC_TYPE_PRIVATE) {
      this.alertService.show('Not applicable', 'Only Private documents can be shared.');
      return;
    }
    const account = await this.shareModal.show();
    if (!account) return;
    this.loadingService.show('Sharing...');
    try {
      let res: any = null;
      if (this.resourceType === 'service') {
        res = await this.apiService.serviceDocumentShare(this.address, doc.id, account);
      } else if (this.resourceType === 'asset') {
        res = await this.apiService.assetDocumentShare(this.address, doc.id, account);
      } else {
        res = await this.apiService.subscriptionDocumentShare(this.address, doc.id, account);
      }
      if (!res) {
        this.alertService.show('Error', 'Share failed. The recipient may not have an encryption public key published on-chain.');
      } else {
        await this.loadSharedWith(doc);
      }
    } finally {
      this.loadingService.hide();
    }
  }

  async unshareAccount(doc: Document, account: string) {
    const ok = await this.alertService.show(
      'Revoke access',
      `Remove ${account} from the recipient list? They will lose decryption capability for this document.`,
      'Revoke',
    );
    if (!ok) return;
    this.loadingService.show('Revoking...');
    try {
      if (this.resourceType === 'service') {
        await this.apiService.serviceDocumentUnshare(this.address, doc.id, account);
      } else if (this.resourceType === 'asset') {
        await this.apiService.assetDocumentUnshare(this.address, doc.id, account);
      } else {
        await this.apiService.subscriptionDocumentUnshare(this.address, doc.id, account);
      }
      await this.loadSharedWith(doc);
    } finally {
      this.loadingService.hide();
    }
  }

  closeModal() {
    this.modalVisible.set(false);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.formSelectedFile.set(file);
    if (file && !this.formTitle().trim()) {
      const base = file.name.replace(/\.[^.]+$/, '');
      this.formTitle.set(base);
    }
    input.value = '';
  }

  async onSave() {
    const mode = this.formState().mode;
    if (mode === 'add') await this.handleAdd();
    else if (mode === 'edit') await this.handleEdit();
  }

  private async handleAdd() {
    const file = this.formSelectedFile();
    if (!file) return;
    const sharedWith = this.isPrivate()
      ? this.recipientSelected().map(r => r.address)
      : [];
    const metadata = {
      title:         this.formTitle().trim(),
      description:   this.formDescription().trim(),
      fileType:      file.type || '',
      documentType:  this.formType(),
      documentState: 1,
      sharedWith,
    };
    this.formUploadProgress.set(0);
    this.loadingService.show('Uploading document...');
    try {
      const onProgress = (p: number) => this.formUploadProgress.set(p);
      let res: any;
      if (this.resourceType === 'service') {
        res = await this.apiService.serviceDocumentAddMultipart(this.address, file, metadata, onProgress);
      } else if (this.resourceType === 'asset') {
        res = await this.apiService.assetDocumentAddMultipart(this.address, file, metadata, onProgress);
      } else {
        res = await this.apiService.subscriptionDocumentAddMultipart(this.address, file, metadata, onProgress);
      }
      if (!res || res.error) {
        // 401 is already handled globally (clears session + redirects to login),
        // so don't surface a duplicate alert in that case.
        if (res?.status !== 401) {
          this.alertService.show('Error', res?.error || 'Failed to add document.');
        }
        return;
      }
      this.closeModal();
      await this.loadDocuments();
    } finally {
      this.formUploadProgress.set(null);
      this.loadingService.hide();
    }
  }

  private async handleEdit() {
    const doc = this.formState().doc as Document | null;
    if (!doc || doc.id === undefined) return;
    // Edit only changes metadata (title / description). CID + documentType stay the same.
    const body = {
      cid:           doc.cid,
      title:         this.formTitle().trim(),
      description:   this.formDescription().trim(),
      fileType:      doc.fileType ?? '',
      documentType:  doc.documentType,
      documentState: doc.documentState,
    };
    this.loadingService.show('Updating document...');
    try {
      if (this.resourceType === 'service') {
        await this.apiService.serviceDocumentUpdate(this.address, doc.id, body);
      } else if (this.resourceType === 'asset') {
        await this.apiService.assetDocumentUpdate(this.address, doc.id, body);
      } else {
        await this.apiService.subscriptionDocumentUpdate(this.address, doc.id, body);
      }
      this.closeModal();
      await this.loadDocuments();
    } finally {
      this.loadingService.hide();
    }
  }

  async removeDocument(doc: Document) {
    const confirmed = await this.alertService.show(
      'Remove Document',
      `Are you sure you want to remove "${doc.title}"?`,
      'Remove'
    );
    if (!confirmed) return;
    this.loadingService.show('Removing document...');
    try {
      if (this.resourceType === 'service') {
        await this.apiService.serviceDocumentRemove(this.address, doc.id);
      } else if (this.resourceType === 'asset') {
        await this.apiService.assetDocumentRemove(this.address, doc.id);
      } else {
        await this.apiService.subscriptionDocumentRemove(this.address, doc.id);
      }
      await this.loadDocuments();
    } finally {
      this.loadingService.hide();
    }
  }

  async viewFile(doc: Document) {
    const win = this._claimTab();   // claim the tab inside the click gesture
    this.loadingService.show('Fetching file...');
    try {
      let fetched: { blobUrl: string; contentType: string } | null = null;
      if (this.resourceType === 'service') {
        fetched = await this.apiService.serviceDocumentFetchFile(this.address, doc.id);
      } else if (this.resourceType === 'asset') {
        fetched = await this.apiService.assetDocumentFetchFile(this.address, doc.id);
      } else {
        fetched = await this.apiService.subscriptionDocumentFetchFile(this.address, doc.id);
      }
      if (!this._revealInTab(win, fetched)) {
        this.alertService.show('Error', 'Could not fetch file.');
      }
    } finally {
      this.loadingService.hide();
    }
  }

  private async _fetchFileBytes(doc: Document): Promise<ArrayBuffer | null> {
    let fetched: { blobUrl: string; contentType: string } | null = null;
    if (this.resourceType === 'service') {
      fetched = await this.apiService.serviceDocumentFetchFile(this.address, doc.id);
    } else if (this.resourceType === 'asset') {
      fetched = await this.apiService.assetDocumentFetchFile(this.address, doc.id);
    } else {
      fetched = await this.apiService.subscriptionDocumentFetchFile(this.address, doc.id);
    }
    if (!fetched) {
      this.alertService.show('Error', 'Could not fetch file.');
      return null;
    }
    try {
      const res = await fetch(fetched.blobUrl);
      return await res.arrayBuffer();
    } finally {
      URL.revokeObjectURL(fetched.blobUrl);
    }
  }

  async signDocument(doc: Document) {
    if (!doc?.cid) return;
    const keyId = await this.signModal.show();
    if (keyId === null) return;
    this.loadingService.show('Hashing file + signing...');
    try {
      const buf = await this._fetchFileBytes(doc);
      if (!buf) return;
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const docHash = '0x' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');

      let signRes: any;
      if (this.resourceType === 'service') {
        signRes = await this.apiService.serviceDocumentSign(this.address, doc.id, keyId, docHash);
      } else if (this.resourceType === 'asset') {
        signRes = await this.apiService.assetDocumentSign(this.address, doc.id, keyId, docHash);
      } else {
        signRes = await this.apiService.subscriptionDocumentSign(this.address, doc.id, keyId, docHash);
      }
      if (signRes?.error) {
        this.alertService.show('Error', signRes.error);
      } else {
        this.alertService.show('Signed', 'Document signed successfully.');
      }
    } finally {
      this.loadingService.hide();
    }
  }

  async publishDocument(doc: Document) {
    if (doc.documentType !== DOC_TYPE_PRIVATE) {
      this.alertService.show('Not applicable', 'Only Private documents can be published.');
      return;
    }
    const ok = await this.alertService.show(
      'Make this document Public?',
      'The file will be re-uploaded to IPFS as plaintext — anyone with the CID will be able to read it. ' +
      'This cannot be undone.',
      'Publish',
    );
    if (!ok) return;
    this.loadingService.show('Publishing...');
    try {
      let res: any;
      if (this.resourceType === 'service') {
        res = await this.apiService.serviceDocumentPublish(this.address, doc.id);
      } else if (this.resourceType === 'asset') {
        res = await this.apiService.assetDocumentPublish(this.address, doc.id);
      } else {
        res = await this.apiService.subscriptionDocumentPublish(this.address, doc.id);
      }
      if (!res) {
        this.alertService.show('Error', 'Publish failed.');
      } else {
        this.closeModal();
        await this.loadDocuments();
      }
    } finally {
      this.loadingService.hide();
    }
  }

  get modalTitle(): string {
    const mode = this.formState().mode;
    if (mode === 'add') return 'Add Document';
    if (mode === 'edit') return 'Edit Document';
    return 'Document Details';
  }

  get isViewMode(): boolean {
    return this.formState().mode === 'view';
  }

  get isAddMode(): boolean {
    return this.formState().mode === 'add';
  }
}
