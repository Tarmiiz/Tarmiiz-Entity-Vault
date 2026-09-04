import { Component, ChangeDetectionStrategy, inject, effect, signal, computed } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalServiceEditService, EditServiceData } from './modal-service-edit.service';
import { ApiService } from '../../../../../shared/services/api.service';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

@Component({
  selector: 'app-modal-service-edit',
  templateUrl: './modal-service-edit.component.html',
  styleUrls: ['./modal-service-edit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalServiceEditComponent {

  editServiceService = inject(ModalServiceEditService);
  private fb: FormBuilder = inject(FormBuilder);
  private apiService = inject(ApiService);

  validators = signal<{ address: string; name: string; validationLevel: number; state: number }[]>([]);
  paymentProcessors = signal<{ address: string; name: string; serviceLevel: number; state: number }[]>([]);
  // ⚠️ Licence-based since Phase 28 step (e) — holds an ACTIVE Token Issuer licence (class 27),
  // not `serviceType === 1`. Empty until the licence read route lands (licensing lane), so this
  // is false meanwhile and the validator/PP pickers stay hidden. Fails CLOSED by design.
  isTokenIssuer = computed(() => (this.editServiceService.service()?.licenses ?? []).includes(27));

  editForm = this.fb.group({
    name: ['', Validators.required],
    validator: [''],
    paymentProcessor: [''],
  });


  constructor() {
    effect(() => {
      const service = this.editServiceService.service();
      if (service) {
        const validatorValue = (service.validator && service.validator !== ZERO_ADDRESS) ? service.validator : '';
        const paymentProcessorValue = (service.paymentProcessor && service.paymentProcessor !== ZERO_ADDRESS) ? service.paymentProcessor : '';
        this.editForm.patchValue({
          name: service.name,
          validator: validatorValue,
          paymentProcessor: paymentProcessorValue,
        });
        if ((service.licenses ?? []).includes(27)) {
          this.loadValidators();
          this.loadPaymentProcessors();
        }
      } else {
        this.editForm.reset();
      }
    });
  }

  async loadValidators() {
    const data = await this.apiService.vaultGetValidators(1, 50);
    if (data?.validators) {
      const level = this.editServiceService.service()?.verificationLevel ?? 0;
      this.validators.set(data.validators.filter((v: any) => v.state === 2 && v.validationLevel >= level));
    }
  }

  async loadPaymentProcessors() {
    const data = await this.apiService.vaultGetPaymentProcessors(1, 50);
    if (data?.paymentProcessors) {
      this.paymentProcessors.set(data.paymentProcessors.filter((s: any) => s.state === 2));
    }
  }

  onSave(): void {
    if (this.editForm.valid) {
      const formValue = this.editForm.getRawValue();
      const serviceData: EditServiceData = {
        name: formValue.name ?? '',
        validator: formValue.validator ?? '',
        paymentProcessor: formValue.paymentProcessor ?? '',
      };
      this.editServiceService.confirm(serviceData);
    }
  }

  onCancel(): void {
    this.editServiceService.cancel();
  }

}
