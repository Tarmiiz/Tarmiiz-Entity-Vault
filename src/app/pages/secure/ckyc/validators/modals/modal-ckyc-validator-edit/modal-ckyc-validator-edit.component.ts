import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ModalcKYCValidatorEditService, EditValidatorData } from './modal-ckyc-validator-edit.service';

@Component({
  selector: 'app-modal-ckyc-validator-edit',
  templateUrl: './modal-ckyc-validator-edit.component.html',
  styleUrls: ['./modal-ckyc-validator-edit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],  
})
export class ModalcKYCValidatorEditComponent {

  editValidatorService = inject(ModalcKYCValidatorEditService);
  private fb: FormBuilder = inject(FormBuilder);

  editForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    mobile: ['', Validators.required],
  });


  constructor() {
    effect(() => {
      const validator = this.editValidatorService.validator();
      if (validator) {
        this.editForm.patchValue({
          name: validator.name,
          email: validator.email,
          mobile: validator.mobile,
        });
      } else {
        this.editForm.reset();
      }
    });
  }

  onSave(): void {
    if (this.editForm.valid) {
      const formValue = this.editForm.getRawValue();
      const operatorData: EditValidatorData = {
        name: formValue.name ?? '',
        email: formValue.email ?? '',
        mobile: formValue.mobile ?? ''
      };
      this.editValidatorService.confirm(operatorData);
    }
  }

  onCancel(): void {
    this.editValidatorService.cancel();
  }

}
