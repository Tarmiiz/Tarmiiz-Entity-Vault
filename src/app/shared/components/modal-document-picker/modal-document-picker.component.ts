import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, untracked } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ApiService } from '../../services/api.service';
import { UtilsService } from '../../services/utils.service';
import { LoadingService } from '../alerts/loading/loading.service';
import { AlertService } from '../alerts/alert/alert.service';
import { ModalDocumentPickerService, DocumentPickerOwner } from './modal-document-picker.service';
import { ModalDocumentAddService } from '../../../pages/secure/documents/modals/modal-document-add/modal-document-add.service';
import { ModalDocumentAddComponent } from '../../../pages/secure/documents/modals/modal-document-add/modal-document-add.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';

interface PickerRow {
  documentId: number;
  title: string;
  fileType: string;
  documentType: number;
  createdAt: number;
}

// Same keys the documents tab binds — one vocabulary, so a document does not read as
// "Private" in the list and something else in the picker.
const DOC_TYPE_NAMES: Record<number, string> = {
  1: 'documentsTab.docType.public',
  2: 'documentsTab.docType.private',
  3: 'documentsTab.docType.internal',
};

@Component({
  selector: 'app-modal-document-picker',
  templateUrl: './modal-document-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [LoadingStateComponent, TranslatePipe, ModalDocumentAddComponent],
})
export class ModalDocumentPickerComponent {

  pickerService = inject(ModalDocumentPickerService);
  private addModal = inject(ModalDocumentAddService);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);
  utils = inject(UtilsService);

  documents = signal<PickerRow[]>([]);
  isLoading = signal(false);
  filter = signal('');
  selectedId = signal<number | null>(null);

  filtered = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const rows = this.documents();
    if (!q) return rows;
    return rows.filter(r => r.title.toLowerCase().includes(q) || String(r.documentId) === q);
  });

  selectedRow = computed(() => this.documents().find(r => r.documentId === this.selectedId()) ?? null);

  constructor() {
    // Load on open. untracked: the body writes `documents`/`selectedId`, which the effect
    // would otherwise re-read and loop on.
    effect(() => {
      if (this.pickerService.isVisible()) {
        untracked(() => {
          this.filter.set('');
          this.selectedId.set(this.pickerService.request()?.selectedId ?? null);
          this.load();
        });
      }
    });
  }

  canUpload(): boolean { return this.pickerService.request()?.canUpload === true; }

  docTypeName(t: number): string {
    return this.translate.instant(DOC_TYPE_NAMES[Number(t)] ?? DOC_TYPE_NAMES[2]);
  }

  private listFor(kind: DocumentPickerOwner, address: string) {
    if (kind === 'service')      return this.apiService.serviceDocumentsList(address, 1, 200);
    if (kind === 'subscription') return this.apiService.subscriptionDocumentsList(address, 1, 200);
    return this.apiService.assetDocumentsList(address, 1, 200);
  }

  async load() {
    const req = this.pickerService.request();
    if (!req?.address) return;
    this.isLoading.set(true);
    try {
      const data: any = await this.listFor(req.resourceType, req.address);
      const rows: PickerRow[] = (data?.documents ?? [])
        // Deleted documents (state 2) are not offerable — a field pointing at one reads as
        // satisfied while the file is gone.
        .filter((r: any) => Number(r.document_state ?? r.documentState ?? 1) !== 2)
        .map((r: any) => ({
          documentId:   Number(r.documentId ?? r.id),
          title:        r.title ?? '',
          fileType:     r.file_type ?? r.fileType ?? '',
          documentType: Number(r.document_type ?? r.documentType ?? 2),
          createdAt:    Number(r.created_at ?? r.createdAt ?? 0),
        }))
        .sort((a: PickerRow, b: PickerRow) => b.documentId - a.documentId);
      this.documents.set(rows);
    } catch {
      this.documents.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  select(id: number) { this.selectedId.set(id); }

  /*
      Upload without leaving the field. Reuses the EXISTING add modal + multipart upload
      rather than growing a second upload form — the 201 body carries the freshly minted
      `documentId`, which is the only thing the caller was missing, so we select it outright.
  */
  async uploadNew() {
    const req = this.pickerService.request();
    if (!req?.address || !this.canUpload()) return;
    const result = await this.addModal.show();
    if (!result) return;

    this.loadingService.show(this.translate.instant('common.processing'));
    try {
      const metadata = {
        title: result.title,
        description: result.description,
        fileType: result.fileType || result.file.type || '',
        documentType: result.documentType,
        documentState: 1,
        sharedWith: result.documentType === 2 ? (result.sharedWith ?? []) : [],
      };
      const res: any = await this.uploadFor(req.resourceType, req.address, result.file, metadata);
      this.loadingService.hide();
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error,
          this.translate.instant('common.close'), 'max-w-md');
        return;
      }
      await this.load();
      // `documentId` is null when the DocumentAdded log could not be parsed — the upload
      // still landed, so refresh and let the operator pick rather than claiming a failure.
      const id = Number(res?.documentId ?? 0);
      if (id > 0) this.selectedId.set(id);
    } catch (e: any) {
      this.loadingService.hide();
      this.alertService.info(this.translate.instant('alerts.error'), e?.error?.error || e?.message || '',
        this.translate.instant('common.close'), 'max-w-md');
    }
  }

  private uploadFor(kind: DocumentPickerOwner, address: string, file: File, metadata: any) {
    if (kind === 'service')      return this.apiService.serviceDocumentAddMultipart(address, file, metadata);
    if (kind === 'subscription') return this.apiService.subscriptionDocumentAddMultipart(address, file, metadata);
    return this.apiService.assetDocumentAddMultipart(address, file, metadata);
  }

  onConfirm() {
    const row = this.selectedRow();
    if (!row) return;
    this.pickerService.confirm({ documentId: row.documentId, title: row.title });
  }

  onCancel() { this.pickerService.cancel(); }
}
