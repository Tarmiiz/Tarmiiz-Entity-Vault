import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ModalEntityEditService, EditEntityData } from './modal-entity-edit.service';

@Component({
  selector: 'app-modal-entity-edit',
  templateUrl: './modal-entity-edit.component.html',
  styleUrls: ['./modal-entity-edit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],  
})
export class ModalEntityEditComponent {

  editEntityService = inject(ModalEntityEditService);
  private fb: FormBuilder = inject(FormBuilder);

  editForm = this.fb.group({
    name: ['', Validators.required],
    website: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    mobile: ['', Validators.required],
  });


  constructor() {
    effect(() => {
      const service = this.editEntityService.service();
      if (service) {
        this.editForm.patchValue({
          name: service.name,
          website: service.website,
          email: service.email,
          mobile: service.mobile,
        });
      } else {
        this.editForm.reset();
      }
    });
  }

  onSave(): void {
    if (this.editForm.valid) {
      const formValue = this.editForm.getRawValue();
      const serviceData: EditEntityData = {
        name: formValue.name ?? '',
        website: formValue.website ?? '',
        email: formValue.email ?? '',
        mobile: formValue.mobile ?? ''
      };
      this.editEntityService.confirm(serviceData);
    }
  }

  onCancel(): void {
    this.editEntityService.cancel();
  }

}
