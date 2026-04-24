import {
  Component, Input, OnChanges, SimpleChanges,
  ChangeDetectionStrategy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../services/api.service';
import { AlertService } from '../alerts/alert/alert.service';
import { LoadingService } from '../alerts/loading/loading.service';
import { UtilsService } from '../../services/utils.service';
import { Document } from '../../models/data.model';
import { ModalDocumentShareService } from '../../../pages/secure/documents/modals/modal-document-share/modal-document-share.service';
import { ModalDocumentShareComponent } from '../../../pages/secure/documents/modals/modal-document-share/modal-document-share.component';

type ResourceType = 'service' | 'asset' | 'subscription';

type DocFormMode = 'add' | 'edit' | 'view';

interface DocFormState {
  mode: DocFormMode;
  doc: Document | null;
}

const DOC_TYPE_PUBLIC  = 1;
const DOC_TYPE_PRIVATE = 2;

@Component({
  selector: 'app-documents-tab',
  templateUrl: './documents-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, ModalDocumentShareComponent],
})
export class DocumentsTabComponent implements OnChanges {
  @Input() resourceType!: ResourceType;
  @Input() address!: string;
  @Input() entityActive = true;

  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private shareModal = inject(ModalDocumentShareService);
  utils = inject(UtilsService);

  // Current recipients for the document open in the view modal. Refreshed each time View opens
  // and after every share / unshare so the list stays in sync with on-chain state.
  sharedWith = signal<string[]>([]);

  documents = signal<Document[]>([]);
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
  formSharedWithRaw = signal('');
  formUploadProgress = signal<number | null>(null);
  formSelectedFile = signal<File | null>(null);

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
    } finally {
      this.loading.set(false);
    }
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

  openAdd() {
    this.formTitle.set('');
    this.formDescription.set('');
    this.formType.set(DOC_TYPE_PRIVATE);
    this.formSharedWithRaw.set('');
    this.formSelectedFile.set(null);
    this.formUploadProgress.set(null);
    this.formState.set({ mode: 'add', doc: null });
    this.modalVisible.set(true);
  }

  openEdit(doc: Document) {
    this.formTitle.set(doc.title);
    this.formDescription.set(doc.description ?? '');
    this.formType.set(doc.documentType);
    this.formSharedWithRaw.set('');
    this.formSelectedFile.set(null);
    this.formUploadProgress.set(null);
    this.formState.set({ mode: 'edit', doc });
    this.modalVisible.set(true);
  }

  openView(doc: Document) {
    this.formState.set({ mode: 'view', doc });
    this.formTitle.set(doc.title);
    this.formDescription.set(doc.description ?? '');
    this.formType.set(doc.documentType);
    this.formSharedWithRaw.set('');
    this.formSelectedFile.set(null);
    this.formUploadProgress.set(null);
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
    this.sharedWith.set(res?.accounts ?? []);
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
      ? this.formSharedWithRaw()
          .split(/[\s,;]+/)
          .map(s => s.trim())
          .filter(s => /^0x[0-9a-fA-F]{40}$/.test(s))
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
      if (!res) {
        this.alertService.show('Error', 'Failed to add document. Check that every recipient has published an encryption public key.');
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
      if (!fetched) {
        this.alertService.show('Error', 'Could not fetch file.');
        return;
      }
      window.open(fetched.blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(fetched!.blobUrl), 60_000);
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
