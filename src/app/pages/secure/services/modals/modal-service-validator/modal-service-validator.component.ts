import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalServiceValidatorService } from './modal-service-validator.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-service-validator',
  templateUrl: './modal-service-validator.component.html',
  styleUrls: ['./modal-service-validator.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
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
    const [data, curated] = await Promise.all([
      this.apiService.vaultGetValidators(1, 50),
      this.apiService.vaultGetServiceProviders(1, 'active'),
    ]);
    if (data?.validators) {
      const level = this.validatorService.verificationLevel();
      const curatedSet = new Set((curated?.providers ?? []).map((p: any) => p.address.toLowerCase()));
      this.validators.set(data.validators.filter((v: any) => v.state === 2 && v.validationLevel >= level && curatedSet.has(v.address.toLowerCase())));
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
