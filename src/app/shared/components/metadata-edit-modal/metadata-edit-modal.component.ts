import { Component, ChangeDetectionStrategy, inject, effect, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormControl, FormArray } from '@angular/forms';

import { MetadataEditModalService } from './metadata-edit-modal.service';

@Component({
  selector: 'app-metadata-edit-modal',
  templateUrl: './metadata-edit-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [ReactiveFormsModule],
})
export class MetadataEditModalComponent {
  editService = inject(MetadataEditModalService);
  private fb = inject(FormBuilder);

  metadataError = signal('');

  editForm = this.fb.group({
    description: [''],
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
        this.editForm.reset({ description: seed.description ?? '' });
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
        return '"description" is reserved — use the Description field above.';
      }
      if (seen.has(key)) {
        return `Duplicate key: "${key}".`;
      }
      seen.add(key);
    }
    return '';
  }

  onSave(): void {
    const err = this.validateMetadata();
    if (err) { this.metadataError.set(err); return; }

    const result: Record<string, string> = {};
    const description = (this.editForm.get('description')?.value ?? '').toString();
    if (description) result['description'] = description;
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
