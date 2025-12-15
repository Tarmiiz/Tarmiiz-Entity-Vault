import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AddValidatorData, ModalcKYCValidatorAddService } from './modal-ckyc-validator-add.service';

@Component({
  selector: 'app-modal-ckyc-validator-add',
  templateUrl: './modal-ckyc-validator-add.component.html',
  styleUrls: ['./modal-ckyc-validator-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalcKYCValidatorAddComponent {

  addValidatorService = inject(ModalcKYCValidatorAddService);
  private fb: FormBuilder = inject(FormBuilder);

  addForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    mobile: ['', Validators.required]
  });

  onSave(): void {
    if (this.addForm.valid) {
      const formValue = this.addForm.getRawValue();
      const validatorData: AddValidatorData = {
        name: formValue.name ?? '',
        email: formValue.email ?? '',
        mobile: formValue.mobile ?? ''
      };
      this.addValidatorService.confirm(validatorData);
    } else {
      this.addForm.markAllAsTouched();
    }
  }

  onCancel(): void {
    this.addValidatorService.cancel();
    this.addForm.reset();
  }

}
