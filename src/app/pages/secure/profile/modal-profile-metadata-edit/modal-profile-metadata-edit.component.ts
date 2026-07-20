import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ModalProfileMetadataEditService } from './modal-profile-metadata-edit.service';

@Component({
  selector: 'app-modal-profile-metadata-edit',
  templateUrl: './modal-profile-metadata-edit.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalProfileMetadataEditComponent {
  editService = inject(ModalProfileMetadataEditService);
  private fb = inject(FormBuilder);

  editForm = this.fb.group({
    description: [''],
    email:   ['', Validators.required],
    phone:   ['', Validators.required],
    website: ['', Validators.required],
    address: ['', Validators.required],
  });

  constructor() {
    effect(() => {
      const meta = this.editService.metadata();
      if (meta) {
        this.editForm.patchValue({
          description: meta.description,
          email:   meta.contact.email,
          phone:   meta.contact.phone,
          website: meta.contact.website,
          address: meta.contact.address,
        });
      } else {
        this.editForm.reset();
      }
    });
  }

  onSave(): void {
    if (!this.editForm.valid) return;
    const v = this.editForm.getRawValue();
    this.editService.confirm({
      description: v.description ?? '',
      contact: {
        email:   v.email   ?? '',
        phone:   v.phone   ?? '',
        website: v.website ?? '',
        address: v.address ?? '',
      },
    });
  }

  onCancel(): void {
    this.editService.cancel();
  }
}
