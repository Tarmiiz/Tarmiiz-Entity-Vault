import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalSignerKeyAddService } from './modal-signer-key-add.service';

@Component({
  selector: 'app-modal-signer-key-add',
  templateUrl: './modal-signer-key-add.component.html',
  styleUrls: ['./modal-signer-key-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
})
export class ModalSignerKeyAddComponent {
  addService = inject(ModalSignerKeyAddService);
  description = signal('');

  constructor() {
    effect(() => {
      if (!this.addService.isVisible()) this.description.set('');
    });
  }

  onSave(): void { this.addService.confirm(this.description()); }
  onCancel(): void { this.addService.cancel(); }
}
