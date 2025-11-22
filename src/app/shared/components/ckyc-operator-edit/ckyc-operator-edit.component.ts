import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CkycOperatorEditService, EditOperatorData } from '../../services/ckyc-operator-edit.service';

@Component({
  selector: 'app-ckyc-operator-edit',
  templateUrl: './ckyc-operator-edit.component.html',
  styleUrls: ['./ckyc-operator-edit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],  
})
export class CkycOperatorEditComponent {

  editOperatorService = inject(CkycOperatorEditService);
  private fb: FormBuilder = inject(FormBuilder);

  editForm = this.fb.group({
    name: ['', Validators.required],
    symbol: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    mobile: ['', Validators.required],
  });

  constructor() {
    effect(() => {
      const operator = this.editOperatorService.operator();
      if (operator) {
        this.editForm.patchValue({
          name: operator.name,
          symbol: operator.symbol,
          email: operator.email,
          mobile: operator.mobile,
        });
      } else {
        this.editForm.reset();
      }
    });
  }

  onSave(): void {
    if (this.editForm.valid) {
      // Transform the form value to match EditOperatorData type
      const formValue = this.editForm.getRawValue();
      const operatorData: EditOperatorData = {
        name: formValue.name ?? '',
        symbol: formValue.symbol ?? '',
        email: formValue.email ?? '',
        mobile: formValue.mobile ?? ''
      };
      this.editOperatorService.confirm(operatorData);
    }
  }

  onCancel(): void {
    this.editOperatorService.cancel();
  }

}
