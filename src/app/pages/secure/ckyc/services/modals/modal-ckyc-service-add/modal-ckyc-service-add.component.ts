import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AddServiceData, ModalcKYCServiceAddService } from './modal-ckyc-service-add.service';

@Component({
  selector: 'app-modal-ckyc-service-add',
  templateUrl: './modal-ckyc-service-add.component.html',
  styleUrls: ['./modal-ckyc-service-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalcKYCServiceAddComponent {

  addServiceService = inject(ModalcKYCServiceAddService);
  private fb: FormBuilder = inject(FormBuilder);

  addForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    mobile: ['', Validators.required]
  });

  onSave(): void {
    if (this.addForm.valid) {
      const formValue = this.addForm.getRawValue();
      const serviceData: AddServiceData = {
        name: formValue.name ?? '',
        email: formValue.email ?? '',
        mobile: formValue.mobile ?? ''
      };
      this.addServiceService.confirm(serviceData);
    } else {
      this.addForm.markAllAsTouched();
    }
  }

  onCancel(): void {
    this.addServiceService.cancel();
    this.addForm.reset();
  }

}
