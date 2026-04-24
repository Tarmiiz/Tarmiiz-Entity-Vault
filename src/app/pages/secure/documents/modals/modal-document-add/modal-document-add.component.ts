import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AddDocumentData, ModalDocumentAddService } from './modal-document-add.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { GlobalVariable } from '../../../../../shared/models/data.model';

const DOC_TYPE_PUBLIC  = 1;
const DOC_TYPE_PRIVATE = 2;

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

  title = signal('');
  description = signal('');
  fileType = signal('');
  documentType = signal<number>(DOC_TYPE_PRIVATE);
  documentState = signal<number>(1);
  selectedFile = signal<File | null>(null);
  selectedFileName = signal('');
  titleAuto = signal(true);

  // Private-doc sharing. Comma- or newline-separated address list; parsed on submit.
  sharedWithRaw = signal('');
  docTypes = signal<GlobalVariable[]>([]);

  // Only Public / Private are supported; anything else in the Global Variables table is filtered
  // out defensively (e.g. a legacy "Shared" entry from a pre-redesign deployment).
  visibleDocTypes = computed(() =>
    this.docTypes().filter(v => v.variableId === DOC_TYPE_PUBLIC || v.variableId === DOC_TYPE_PRIVATE)
  );

  isValid = computed(() => !!this.selectedFile() && !!this.description());

  constructor() {
    effect(() => {
      if (this.addService.isVisible() && this.docTypes().length === 0) {
        this.loadGlobals();
      }
      if (!this.addService.isVisible()) {
        this.title.set('');
        this.titleAuto.set(true);
        this.description.set('');
        this.fileType.set('');
        this.documentType.set(DOC_TYPE_PRIVATE);
        this.documentState.set(1);
        this.selectedFile.set(null);
        this.selectedFileName.set('');
        this.sharedWithRaw.set('');
      }
    });
  }

  async loadGlobals() {
    const typesRes = await this.apiService.vaultGetGlobalVariablesList('Document Type');
    if (typesRes?.variables) this.docTypes.set(typesRes.variables as GlobalVariable[]);
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

  isPrivate = computed(() => this.documentType() === DOC_TYPE_PRIVATE);

  onSave(): void {
    const file = this.selectedFile();
    if (!file || !this.isValid()) return;

    // Parse sharedWith only for Private docs — ignore for Public.
    const sharedWith = this.isPrivate()
      ? this.sharedWithRaw()
          .split(/[\s,;]+/)
          .map(s => s.trim())
          .filter(s => /^0x[0-9a-fA-F]{40}$/.test(s))
      : [];

    const data: AddDocumentData = {
      file,
      title: this.title(),
      description: this.description(),
      fileType: this.fileType(),
      documentType: this.documentType(),
      documentState: this.documentState(),
      sharedWith,
    };
    this.addService.confirm(data);
  }

  onCancel(): void {
    this.addService.cancel();
  }
}
