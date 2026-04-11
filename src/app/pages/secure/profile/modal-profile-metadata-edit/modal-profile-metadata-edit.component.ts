import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ModalProfileMetadataEditService } from './modal-profile-metadata-edit.service';

@Component({
  selector: 'app-modal-profile-metadata-edit',
  templateUrl: './modal-profile-metadata-edit.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
})
export class ModalProfileMetadataEditComponent {
  editService = inject(ModalProfileMetadataEditService);
  private fb = inject(FormBuilder);

  editForm = this.fb.group({
    email:   ['', Validators.required],
    mobile:  ['', Validators.required],
    website: ['', Validators.required],
  });

  constructor() {
    effect(() => {
      const meta = this.editService.metadata();
      if (meta) {
        this.editForm.patchValue({ email: meta.email, mobile: meta.mobile, website: meta.website });
      } else {
        this.editForm.reset();
      }
    });
  }

  onSave(): void {
    if (!this.editForm.valid) return;
    const v = this.editForm.getRawValue();
    this.editService.confirm({ email: v.email ?? '', mobile: v.mobile ?? '', website: v.website ?? '' });
  }

  onCancel(): void {
    this.editService.cancel();
  }
}
