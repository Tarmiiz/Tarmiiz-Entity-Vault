import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

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

type Tab = 'mine' | 'shared';

@Component({
  selector: 'app-documents-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, ModalDocumentAddComponent, TranslatePipe]
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

  get userInfo() { return this.authService.userInfo; }

  loading = false;
  activeTab = signal<Tab>('mine');
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
    this.loadingService.show('Loading documents...');
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

  setTab(tab: Tab) { this.activeTab.set(tab); }

  filtered = computed(() => {
    const term = this.search().toLowerCase();
    const t = this.filterType();
    const s = this.filterState();
    return this.documents().filter(d =>
      (!t || String(d.documentType) === t) &&
      (!s || String(d.documentState) === s) &&
      (!term ||
        d.title?.toLowerCase().includes(term) ||
        d.description?.toLowerCase().includes(term) ||
        d.cid?.toLowerCase().includes(term) ||
        String(d.id).includes(term))
    );
  });

  filteredShared = computed(() => {
    const term = this.search().toLowerCase();
    return this.sharedWithMe().filter(s =>
      !term ||
      s.title?.toLowerCase().includes(term) ||
      s.cid?.toLowerCase().includes(term) ||
      s.ownerAddress?.toLowerCase().includes(term) ||
      String(s.documentId).includes(term)
    );
  });

  typeLabel(t: number): string {
    switch (t) {
      case 1: return 'Public';
      case 2: return 'Private';
      default: return String(t);
    }
  }

  typeClass(t: number): string {
    switch (t) {
      case 1: return 'bg-blue-100 text-blue-800';
      case 2: return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  stateLabel(s: number): string {
    switch (s) {
      case 1: return 'Active';
      case 2: return 'Deleted';
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
  }

  view(doc: Document) {
    this.router.navigate(['/authorized/documents/details/' + doc.id]);
  }

  viewShared(share: DocumentShare) {
    // Open the read-only shared-document details (title / description / type / CID + View File),
    // mirroring "My Documents" details so the recipient can read the description, not just the file.
    this.router.navigate(['/authorized/documents/shared/' + share.ownerAddress + '/' + share.documentId]);
  }

  async onAddClick() {
    const data = await this.addModal.show();
    if (!data) return;
    this.loadingService.show('Uploading and registering document...');
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
          this.alertService.show('Error', result?.error || 'Failed to add document.');
        }
      } else {
        await this.list();
      }
    } finally {
      this.loadingService.hide();
    }
  }

}
