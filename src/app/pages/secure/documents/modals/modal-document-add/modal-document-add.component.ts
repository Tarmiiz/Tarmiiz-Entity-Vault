import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AddDocumentData, ModalDocumentAddService } from './modal-document-add.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { GlobalVariable } from '../../../../../shared/models/data.model';

@Component({
  selector: 'app-modal-document-add',
  templateUrl: './modal-document-add.component.html',
  styleUrls: ['./modal-document-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class ModalDocumentAddComponent {
  addService = inject(ModalDocumentAddService);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);

  cid = signal('');
  title = signal('');
  description = signal('');
  fileType = signal('');
  documentType = signal<number>(2);
  documentState = signal<number>(1);
  uploading = signal(false);
  uploadProgress = signal(0);
  selectedFile = signal<File | null>(null);
  selectedFileName = signal('');
  titleAuto = signal(true);

  docTypes = signal<GlobalVariable[]>([]);
  docStates = signal<GlobalVariable[]>([]);

  isValid = computed(() =>
    !!this.description() && (!!this.cid() || !!this.selectedFile())
  );

  constructor() {
    effect(() => {
      if (this.addService.isVisible() && this.docTypes().length === 0) {
        this.loadGlobals();
      }
      if (!this.addService.isVisible()) {
        this.cid.set('');
        this.title.set('');
        this.titleAuto.set(true);
        this.description.set('');
        this.fileType.set('');
        this.documentType.set(2);
        this.documentState.set(1);
        this.selectedFile.set(null);
        this.selectedFileName.set('');
        this.uploading.set(false);
      }
    });
  }

  async loadGlobals() {
    const [typesRes, statesRes] = await Promise.all([
      this.apiService.vaultGetGlobalVariablesList('Document Type'),
      this.apiService.vaultGetGlobalVariablesList('Document State'),
    ]);
    if (typesRes?.variables)  this.docTypes.set(typesRes.variables as GlobalVariable[]);
    if (statesRes?.variables) this.docStates.set(statesRes.variables as GlobalVariable[]);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.selectedFile.set(file);
    this.selectedFileName.set(file.name);
    this.fileType.set(file.type || 'application/octet-stream');
    if (!this.title() || this.titleAuto()) {
      const dot = file.name.lastIndexOf('.');
      this.title.set(dot > 0 ? file.name.slice(0, dot) : file.name);
      this.titleAuto.set(true);
    }
    this.cid.set('');
  }

  onTitleInput(value: string) {
    this.title.set(value);
    this.titleAuto.set(false);
  }

  clearFile(): void {
    this.selectedFile.set(null);
    this.selectedFileName.set('');
    this.fileType.set('');
    const input = document.getElementById('docFileInput') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  async onSave(): Promise<void> {
    if (!this.isValid()) return;

    let cid = this.cid();
    const file = this.selectedFile();

    if (file && !cid) {
      this.uploading.set(true);
      this.loadingService.show('Uploading to IPFS...');
      this.loadingService.setProgress(0);
      try {
        const uploaded = await this.apiService.ipfsUploadFile(file, (p) => this.loadingService.setProgress(p));
        if (!uploaded) {
          this.alertService.show('Error', 'Upload to IPFS failed.');
          return;
        }
        cid = uploaded;
        this.cid.set(uploaded);
      } finally {
        this.uploading.set(false);
        this.loadingService.hide();
      }
    }

    const data: AddDocumentData = {
      cid,
      title: this.title(),
      description: this.description(),
      fileType: this.fileType(),
      documentType: this.documentType(),
      documentState: this.documentState(),
    };
    this.addService.confirm(data);
  }

  onCancel(): void {
    this.addService.cancel();
  }
}
