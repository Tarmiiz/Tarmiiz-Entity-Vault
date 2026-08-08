import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { UtilsService } from '../../../../shared/services/utils.service';

import { Document, DocumentShare, GlobalVariable } from '../../../../shared/models/data.model';
import { ModalDocumentAddComponent } from '../modals/modal-document-add/modal-document-add.component';
import { ModalDocumentAddService } from '../modals/modal-document-add/modal-document-add.service';
import { PaginatorComponent, pageSlice } from '../../../../shared/components/paginator/paginator.component';

// Single-list row: an own document OR an inbound share (the Vault has no detail
// pages for foreign owners, so entity-level inbound shares live on this list;
// shares to child templates surface on the service/asset/subscription tabs).
interface DocRow {
  kind: 'own' | 'shared';
  id: number;
  title: string;
  fileType: string;
  cid: string;
  documentType: number | null;
  date: number;
  state: number;
  owner: string;
  doc: Document | null;
  share: DocumentShare | null;
}

@Component({
  selector: 'app-documents-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, ModalDocumentAddComponent, TranslatePipe, PaginatorComponent]
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  addModal = inject(ModalDocumentAddService);
  utils = inject(UtilsService);
  private authService = inject(AuthService);
  features = inject(FeaturesService);
  private translate = inject(TranslateService);

  get userInfo() { return this.authService.userInfo; }

  loading = false;
  documents = signal<Document[]>([]);
  sharedWithMe = signal<DocumentShare[]>([]);

  ipfsStatus = signal<'unknown' | 'ok' | 'down'>('unknown');
  ipfsPeerId = signal<string>('');
  ipfsPeers = signal<number>(0);

  search = signal('');
  filterType = signal<string>('');
  filterState = signal<string>('');

  docTypes = signal<GlobalVariable[]>([]);
  docStates = signal<GlobalVariable[]>([]);

  ngOnInit() {}

  async ionViewDidEnter() {
    this.loading = true;
    await Promise.all([this.list(), this.loadSharedWithMe(), this.checkIpfs(), this.loadGlobals()]);
    this.loading = false;
  }

  async loadGlobals() {
    const [typesRes, statesRes] = await Promise.all([
      this.apiService.vaultGetGlobalVariablesList('Document Type'),
      this.apiService.vaultGetGlobalVariablesList('Document State'),
    ]);
    // API returns raw snake_case rows (`variable_id`); map to the camelCase model so
    // `track v.variableId` gets a real key (else every option keys to "" → NG0955).
    const map = (rows: any[]): GlobalVariable[] =>
      (rows || []).map(v => new GlobalVariable(v.category, Number(v.variable_id), v.name, !!v.visible));
    if (typesRes?.variables)  this.docTypes.set(map(typesRes.variables));
    if (statesRes?.variables) this.docStates.set(map(statesRes.variables));
  }

  async checkIpfs() {
    const r = await this.apiService.ipfsHealth();
    if (r?.success) {
      this.ipfsStatus.set('ok');
      this.ipfsPeerId.set(r.peerId || '');
      this.ipfsPeers.set(r.connectedPeers || 0);
    } else {
      this.ipfsStatus.set('down');
      this.ipfsPeerId.set('');
      this.ipfsPeers.set(0);
    }
  }

  async list() {
    this.loadingService.show(this.translate.instant('documents.list.loadingDocuments'));
    const result = await this.apiService.documentsList(1, 100);
    if (result?.documents) {
      this.documents.set(result.documents);
    }
    this.loadingService.hide();
  }

  async loadSharedWithMe() {
    const result = await this.apiService.documentsSharedWithMe(1, 100);
    if (result?.shares) {
      // API returns raw snake_case rows from SQLite; map to camelCase for the template.
      const shares = (result.shares as any[]).map(r => new DocumentShare(
        r.owner_address,
        Number(r.document_id),
        r.shared_with_address,
        r.cid ?? null,
        r.title ?? null,
        r.document_type !== null && r.document_type !== undefined ? Number(r.document_type) : null,
        Number(r.shared_at || 0),
        Number(r.updated_at || 0),
      ));
      this.sharedWithMe.set(shares);
    }
  }

  // ONE list: own documents + entity-level inbound shares, newest-first. Shared
  // documents from parties with their own pages surface on those pages instead
  // (service / asset / subscription Documents tabs); everything reaching the
  // entity itself (e.g. regulator-shared docs) lands here.
  /** 1-based, per frontend Standard 1.5. */
  rowsPage = signal(1);
  rowsPageSize = signal(25);
  pagedRows = computed(() => pageSlice(this.rows(), this.rowsPage(), this.rowsPageSize()));
  rows = computed<DocRow[]>(() => {
    const term = this.search().toLowerCase();
    const t = this.filterType();
    const s = this.filterState();

    const own: DocRow[] = this.documents().map(d => ({
      kind: 'own' as const,
      id: d.id,
      title: d.title || '',
      fileType: d.fileType || '',
      cid: d.cid || '',
      documentType: d.documentType,
      date: d.createdAt,
      state: d.documentState,
      owner: '',
      doc: d,
      share: null,
    }));
    const shared: DocRow[] = this.sharedWithMe().map(sh => ({
      kind: 'shared' as const,
      id: sh.documentId,
      title: sh.title || '',
      fileType: '',
      cid: sh.cid || '',
      documentType: sh.documentType,
      date: sh.sharedAt,
      state: 0,
      owner: sh.ownerAddress || '',
      doc: null,
      share: sh,
    }));

    return [...own, ...shared]
      .filter(r =>
        (!t || String(r.documentType ?? '') === t) &&
        // The state filter only applies to own docs (shares carry no state).
        (!s || (r.kind === 'own' && String(r.state) === s)) &&
        (!term ||
          r.title.toLowerCase().includes(term) ||
          r.cid.toLowerCase().includes(term) ||
          r.owner.toLowerCase().includes(term) ||
          (r.kind === 'own' && (r.doc?.description || '').toLowerCase().includes(term)) ||
          String(r.id).includes(term)))
      .sort((a, b) => b.date - a.date);
  });

  totalCount = computed(() => this.documents().length + this.sharedWithMe().length);

  typeLabel(t: number): string {
    switch (t) {
      case 1: return this.translate.instant('documents.type.public');
      case 2: return this.translate.instant('documents.type.private');
      case 3: return this.translate.instant('documents.type.internal');
      default: return String(t);
    }
  }

  typeClass(t: number): string {
    switch (t) {
      case 1: return 'bg-blue-100 text-blue-800';
      case 2: return 'bg-yellow-100 text-yellow-800';
      case 3: return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  stateLabel(s: number): string {
    switch (s) {
      case 1: return this.translate.instant('documents.docState.active');
      case 2: return this.translate.instant('documents.docState.deleted');
      default: return String(s);
    }
  }

  stateClass(s: number): string {
    switch (s) {
      case 1: return 'bg-green-100 text-green-800';
      case 2: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  clearFilters() {
    this.search.set('');
    this.filterType.set('');
    this.filterState.set('');
    this.rowsPage.set(1);
  }

  view(row: DocRow) {
    if (row.kind === 'own' && row.doc) {
      this.router.navigate(['/authorized/documents/details/' + row.doc.id]);
    } else if (row.share) {
      // Read-only shared-document details (title / type / CID + View File + signatures).
      this.router.navigate(['/authorized/documents/shared/' + row.share.ownerAddress + '/' + row.share.documentId]);
    }
  }

  async onAddClick() {
    const data = await this.addModal.show();
    if (!data) return;
    this.loadingService.show(this.translate.instant('documents.list.uploadingDocument'));
    try {
      const result = await this.apiService.documentAddMultipart(
        data.file,
        {
          title:         data.title,
          description:   data.description,
          fileType:      data.fileType,
          documentType:  data.documentType,
          documentState: data.documentState,
          sharedWith:    data.sharedWith,
        },
        (percent) => this.loadingService.setProgress(percent),
      );
      if (!result || result.error) {
        // 401 already triggers a global session-clear + redirect, no duplicate alert.
        if (result?.status !== 401) {
          this.alertService.show(this.translate.instant('alerts.error'), result?.error || this.translate.instant('documents.list.addDocumentFailed'));
        }
      } else {
        await this.list();
      }
    } finally {
      this.loadingService.hide();
    }
  }

}
