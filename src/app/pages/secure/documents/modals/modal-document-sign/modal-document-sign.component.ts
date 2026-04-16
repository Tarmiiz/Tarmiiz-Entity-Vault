import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ModalDocumentSignService } from './modal-document-sign.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-document-sign',
  templateUrl: './modal-document-sign.component.html',
  styleUrls: ['./modal-document-sign.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class ModalDocumentSignComponent {
  signService = inject(ModalDocumentSignService);
  private apiService = inject(ApiService);

  keys = signal<any[]>([]);
  selectedKeyId = signal<number | null>(null);
  loading = signal(false);

  isValid = computed(() => this.selectedKeyId() !== null);

  constructor() {
    effect(() => {
      if (this.signService.isVisible()) {
        this.loadKeys();
      } else {
        this.selectedKeyId.set(null);
      }
    });
  }

  async loadKeys() {
    this.loading.set(true);
    try {
      const r = await this.apiService.signerKeyList(1, 200);
      const active = (r?.keys ?? []).filter((k: any) => k.state === 1);
      this.keys.set(active);
      if (active.length === 1) this.selectedKeyId.set(active[0].keyId);
    } finally {
      this.loading.set(false);
    }
  }

  onSave(): void { if (this.isValid()) this.signService.confirm(this.selectedKeyId()!); }
  onCancel(): void { this.signService.cancel(); }
}
