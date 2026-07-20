import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../../shared/components/header/header.component';
import { ApiService } from '../../../../../shared/services/api.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../../shared/services/utils.service';

import { Document, GlobalVariable } from '../../../../../shared/models/data.model';
import { ModalDocumentAddService } from '../../../documents/modals/modal-document-add/modal-document-add.service';
import { ModalDocumentAddComponent } from '../../../documents/modals/modal-document-add/modal-document-add.component';

@Component({
  selector: 'app-asset-documents-list',
  templateUrl: './list.page.html',
  standalone: true,
  imports: [FormsModule, RouterLink, HeaderComponent, ModalDocumentAddComponent, TranslatePipe]
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);
  utils = inject(UtilsService);
  private addModal = inject(ModalDocumentAddService);
  private authService = inject(AuthService);
  features = inject(FeaturesService);

  get userInfo() { return this.authService.userInfo; }

  assetAddress = signal<string>('');
  loading = false;
  documents = signal<Document[]>([]);

  search = signal('');
  filterType = signal<string>('');
  filterState = signal<string>('');

  docTypes = signal<GlobalVariable[]>([]);
  docStates = signal<GlobalVariable[]>([]);

  ngOnInit() {
    this.assetAddress.set(this.route.snapshot.paramMap.get('address') || '');
  }

  async ionViewDidEnter() {
    this.loading = true;
    await Promise.all([this.list(), this.loadGlobals()]);
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

  async list() {
    this.loadingService.show(this.translate.instant('assets.documents.list.loading'));
    const result = await this.apiService.assetDocumentsList(this.assetAddress(), 1, 100);
    if (result?.documents) this.documents.set(result.documents);
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

  typeLabel(t: number): string { return this.docTypes().find(v => v.variableId === t)?.name || String(t); }
  stateLabel(s: number): string { return this.docStates().find(v => v.variableId === s)?.name || String(s); }
  stateClass(s: number): string {
    switch (s) {
      case 1: return 'bg-green-100 text-green-800';
      case 2: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  clearFilters() { this.search.set(''); this.filterType.set(''); this.filterState.set(''); }

  view(doc: Document) {
    this.router.navigate(['/authorized/assets/documents/details/' + this.assetAddress() + '/' + doc.id]);
  }

  async add() {
    const result = await this.addModal.show();
    if (!result) return;
    this.loadingService.show(this.translate.instant('assets.documents.list.adding'));
    try {
      const response = await this.apiService.assetDocumentAdd(this.assetAddress(), result);
      if (response?.error) this.alertService.show(this.translate.instant('alerts.error'), response.error);
      else await this.list();
    } finally { this.loadingService.hide(); }
  }
}
