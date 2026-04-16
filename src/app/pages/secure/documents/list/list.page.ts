import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';

import { Document, GlobalVariable } from '../../../../shared/models/data.model';
import { ModalDocumentAddService } from '../modals/modal-document-add/modal-document-add.service';
import { ModalDocumentAddComponent } from '../modals/modal-document-add/modal-document-add.component';

@Component({
  selector: 'app-documents-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, ModalDocumentAddComponent]
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  utils = inject(UtilsService);
  private addModal = inject(ModalDocumentAddService);

  loading = false;
  documents = signal<Document[]>([]);
  documentsCount = 0;

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
    await Promise.all([this.list(), this.checkIpfs(), this.loadGlobals()]);
    this.loading = false;
  }

  async loadGlobals() {
    const [typesRes, statesRes] = await Promise.all([
      this.apiService.vaultGetGlobalVariablesList('Document Type'),
      this.apiService.vaultGetGlobalVariablesList('Document State'),
    ]);
    if (typesRes?.variables)  this.docTypes.set(typesRes.variables as GlobalVariable[]);
    if (statesRes?.variables) this.docStates.set(statesRes.variables as GlobalVariable[]);
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
      this.documentsCount = result.count ?? result.documents.length;
      this.documents.set(result.documents);
    }
    this.loadingService.hide();
  }

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

  typeLabel(t: number): string {
    return this.docTypes().find(v => v.variableId === t)?.name || String(t);
  }

  stateLabel(s: number): string {
    return this.docStates().find(v => v.variableId === s)?.name || String(s);
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

  async add() {
    const result = await this.addModal.show();
    if (!result) return;
    this.loadingService.show('Adding document...');
    try {
      const response = await this.apiService.documentAdd(result);
      if (!response || response?.error) {
        this.alertService.show('Error', response?.error || 'Failed to add document');
      } else {
        await this.list();
      }
    } finally {
      this.loadingService.hide();
    }
  }
}
