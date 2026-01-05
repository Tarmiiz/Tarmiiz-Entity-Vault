import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ModalServiceEditService, EditServiceData } from './modal-service-edit.service';

@Component({
  selector: 'app-modal-service-edit',
  templateUrl: './modal-service-edit.component.html',
  styleUrls: ['./modal-service-edit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],  
})
export class ModalServiceEditComponent {

  editServiceService = inject(ModalServiceEditService);
  private fb: FormBuilder = inject(FormBuilder);

  editForm = this.fb.group({
    name: ['', Validators.required],
    website: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    mobile: ['', Validators.required],
  });


  constructor() {
    effect(() => {
      const service = this.editServiceService.service();
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
      const serviceData: EditServiceData = {
        name: formValue.name ?? '',
        website: formValue.website ?? '',
        email: formValue.email ?? '',
        mobile: formValue.mobile ?? ''
      };
      this.editServiceService.confirm(serviceData);
    }
  }

  onCancel(): void {
    this.editServiceService.cancel();
  }

}
