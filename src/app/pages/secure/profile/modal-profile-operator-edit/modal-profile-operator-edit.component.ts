import { Component, ChangeDetectionStrategy, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ModalProfileOperatorEditService, EditOperatorData } from './modal-profile-operator-edit.service';

@Component({
  selector: 'app-modal-profile-operator-edit',
  templateUrl: './modal-profile-operator-edit.component.html',
  styleUrls: ['./modal-profile-operator-edit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],  
})
export class ModalProfileOperatorEditComponent {

  editProfileOperatorEditService = inject(ModalProfileOperatorEditService);
  private fb: FormBuilder = inject(FormBuilder);

  title = signal<string | null>(null);
  confirming = signal(false);
  pendingAddress = signal<string>('');

  editForm = this.fb.group({
    address: ['', Validators.required],
  });

  constructor() {
    effect(() => {
      const title = this.editProfileOperatorEditService.title();
      if (title) {
        this.title.set(title);
      }
      const service = this.editProfileOperatorEditService.operator();
      if (service) {
        this.editForm.patchValue({ address: service });
        this.confirming.set(false);
      } else {
        this.editForm.reset();
        this.confirming.set(false);
      }
    });
  }

  onSave(): void {
    if (this.editForm.valid) {
      this.pendingAddress.set(this.editForm.getRawValue().address ?? '');
      this.confirming.set(true);
    }
  }

  onConfirm(): void {
    this.editProfileOperatorEditService.confirm({ address: this.pendingAddress() });
  }

  onBack(): void {
    this.confirming.set(false);
  }

  onCancel(): void {
    this.editProfileOperatorEditService.cancel();
  }

}
