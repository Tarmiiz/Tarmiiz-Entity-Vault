import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder } from '@angular/forms';

import { ModalServiceValidatorService } from './modal-service-validator.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-service-validator',
  templateUrl: './modal-service-validator.component.html',
  styleUrls: ['./modal-service-validator.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
})
export class ModalServiceValidatorComponent {

  validatorService = inject(ModalServiceValidatorService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  validators = signal<{ address: string; name: string; validationLevel: number; state: number }[]>([]);

  validatorForm = this.fb.group({
    validator: [''],
  });

  constructor() {
    effect(() => {
      if (this.validatorService.isVisible()) {
        this.loadValidators();
        this.validatorForm.get('validator')?.setValue(this.validatorService.currentValidator());
      }
    });
  }

  async loadValidators() {
    const data = await this.apiService.vaultGetValidators(1, 50);
    if (data?.validators) {
      const level = this.validatorService.verificationLevel();
      this.validators.set(data.validators.filter((v: any) => v.state === 2 && v.validationLevel >= level));
    }
  }

  onSave(): void {
    const value = this.validatorForm.get('validator')?.value ?? '';
    this.validatorService.confirm(value);
  }

  onCancel(): void {
    this.validatorService.cancel();
  }
}
