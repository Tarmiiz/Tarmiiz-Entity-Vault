import { Component, ChangeDetectionStrategy, inject, signal, effect, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalImageAddService } from './modal-image-add.service';

@Component({
  selector: 'app-modal-image-add',
  templateUrl: './modal-image-add.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TranslatePipe],
})
export class ModalImageAddComponent {

  addImageService = inject(ModalImageAddService);

  file = signal<File | null>(null);
  previewUrl = signal('');
  title = signal('');
  role = signal<'avatar' | 'banner' | 'gallery'>('gallery');
  documentType = signal(1);

  constructor() {
    // Reset each time the modal opens. untracked: clearFile reads previewUrl — tracked
    // here, a later file selection would re-trigger this effect and wipe the selection.
    effect(() => {
      if (this.addImageService.isVisible()) {
        untracked(() => {
          this.clearFile();
          this.title.set('');
          this.role.set('gallery');
          this.documentType.set(1);
        });
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && file.type.startsWith('image/')) {
      if (this.previewUrl()) URL.revokeObjectURL(this.previewUrl());
      this.file.set(file);
      this.previewUrl.set(URL.createObjectURL(file));
    }
    input.value = '';
  }

  private clearFile(): void {
    if (this.previewUrl()) URL.revokeObjectURL(this.previewUrl());
    this.file.set(null);
    this.previewUrl.set('');
  }

  // Avatar/banner are public-only — force Public when a role is picked.
  setRole(role: string): void {
    const r = (role === 'avatar' || role === 'banner') ? role : 'gallery';
    this.role.set(r);
    if (r !== 'gallery') this.documentType.set(1);
  }

  onSave(): void {
    const file = this.file();
    if (!file) return;
    this.addImageService.confirm({
      file,
      title: this.title().trim() || file.name,
      role: this.role(),
      documentType: this.role() !== 'gallery' ? 1 : this.documentType(),
    });
    this.clearFile();
  }

  onCancel(): void {
    this.clearFile();
    this.addImageService.cancel();
  }
}
