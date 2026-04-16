import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ModalDocumentShareService } from './modal-document-share.service';

@Component({
  selector: 'app-modal-document-share',
  templateUrl: './modal-document-share.component.html',
  styleUrls: ['./modal-document-share.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class ModalDocumentShareComponent {
  shareService = inject(ModalDocumentShareService);

  account = signal('');
  isValid = computed(() => /^0x[a-fA-F0-9]{40}$/.test(this.account()));

  constructor() {
    effect(() => { if (!this.shareService.isVisible()) this.account.set(''); });
  }

  onSave(): void { if (this.isValid()) this.shareService.confirm(this.account()); }
  onCancel(): void { this.shareService.cancel(); }
}
