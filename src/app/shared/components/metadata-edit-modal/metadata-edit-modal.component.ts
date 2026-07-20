import { Component, ChangeDetectionStrategy, inject, effect, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormControl, FormArray } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { MetadataEditModalService } from './metadata-edit-modal.service';

@Component({
  selector: 'app-metadata-edit-modal',
  templateUrl: './metadata-edit-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class MetadataEditModalComponent {
  editService = inject(MetadataEditModalService);
  private fb = inject(FormBuilder);
  private translate = inject(TranslateService);

  metadataError = signal('');

  editForm = this.fb.group({
    description: [''],
    contact: this.fb.group({
      email:   [''],
      phone:   [''],
      website: [''],
      address: [''],
    }),
    metadata: this.fb.array<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>>([]),
  });

  get metadataRows(): FormArray<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>> {
    return this.editForm.get('metadata') as FormArray<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>>;
  }

  constructor() {
    // Re-seed the form whenever the modal opens.
    effect(() => {
      const seed = this.editService.seed();
      if (this.editService.isVisible() && seed) {
        this.editForm.reset({
          description: seed.description ?? '',
          contact: {
            email:   seed.contact?.email   ?? '',
            phone:   seed.contact?.phone   ?? '',
            website: seed.contact?.website ?? '',
            address: seed.contact?.address ?? '',
          },
        });
        this.metadataRows.clear();
        for (const [k, v] of (seed.entries ?? [])) {
          this.metadataRows.push(this.fb.nonNullable.group({ key: k, value: v }));
        }
        this.metadataError.set('');
      }
    });

    this.metadataRows.valueChanges.subscribe(() => {
      this.metadataError.set(this.validateMetadata());
    });
  }

  addMetadataRow(): void {
    this.metadataRows.push(this.fb.nonNullable.group({ key: '', value: '' }));
  }

  removeMetadataRow(index: number): void {
    this.metadataRows.removeAt(index);
  }

  /** Returns '' if valid, else a user-facing error. Empty-key rows are ignored (dropped on save). */
  private validateMetadata(): string {
    const seen = new Set<string>();
    for (const ctrl of this.metadataRows.controls) {
      const key = (ctrl.controls.key.value ?? '').trim();
      if (!key) continue;
      if (key.toLowerCase() === 'description') {
        return this.translate.instant('shared.metadataEditModal.errors.descriptionReserved');
      }
      if (key.toLowerCase() === 'media') {
        return this.translate.instant('shared.metadataEditModal.errors.mediaReserved');
      }
      if (key.toLowerCase() === 'contact') {
        return this.translate.instant('shared.metadataEditModal.errors.contactReserved');
      }
      if (seen.has(key)) {
        return this.translate.instant('shared.metadataEditModal.errors.duplicateKey', { key });
      }
      seen.add(key);
    }
    return '';
  }

  onSave(): void {
    const err = this.validateMetadata();
    if (err) { this.metadataError.set(err); return; }

    const result: Record<string, any> = {};
    const description = (this.editForm.get('description')?.value ?? '').toString();
    if (description) result['description'] = description;
    // Always emit the nested `contact` object (the API converges legacy flat keys into it).
    const c = this.editForm.controls.contact.getRawValue();
    result['contact'] = {
      email:   (c.email   ?? '').toString().trim(),
      phone:   (c.phone   ?? '').toString().trim(),
      website: (c.website ?? '').toString().trim(),
      address: (c.address ?? '').toString().trim(),
    };
    for (const ctrl of this.metadataRows.controls) {
      const key = (ctrl.controls.key.value ?? '').trim();
      if (!key) continue;
      result[key] = (ctrl.controls.value.value ?? '').trim();
    }
    this.editService.confirm(result);
  }

  onCancel(): void {
    this.editService.cancel();
  }
}
