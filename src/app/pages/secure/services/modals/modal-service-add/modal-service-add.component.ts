import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalServiceAddService, AddServiceData } from './modal-service-add.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { environment } from '../../../../../../environments/environment';

@Component({
  selector: 'app-modal-service-add',
  templateUrl: './modal-service-add.component.html',
  styleUrls: ['./modal-service-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalServiceAddComponent {

  addServiceService = inject(ModalServiceAddService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  verificationLevels = signal<{ variableId: number; name: string }[]>([]);
  regulators = signal<{ address: string; name: string; symbol: string }[]>([]);

  addForm = this.fb.group({
    name: ['', Validators.required],
    description: ['', Validators.required],
    website: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    mobile: ['', Validators.required],
    verificationLevel: ['', Validators.required],
    regulator: ['', Validators.required],
  });

  constructor() {
    effect(() => {
      if (this.addServiceService.isVisible()) {
        this.loadVerificationLevels();
        this.loadRegulators();
      }
    });
  }

  async loadVerificationLevels() {
    const data = await this.apiService.vaultGetGlobalVariables();
    if (data) {
      this.verificationLevels.set(
        data
          .filter((item: any) => item.category === 'Identity Verification Level')
          .map((item: any) => ({ variableId: item.variable_id, name: item.name }))
      );
    }
  }

  async loadRegulators() {
    const data = await this.apiService.vaultGetRegulatorsByCountry(String(environment.countryCode), 0, 100);
    if (data) {
      this.regulators.set(data.filter((r: any) => r.state).map((r: any) => ({ address: r.address, name: r.name, symbol: r.symbol })));
    }
  }

  onSave(): void {
    if (this.addForm.invalid) return;

    const formValue = this.addForm.getRawValue();
    const data: AddServiceData = {
      name: formValue.name ?? '',
      description: formValue.description ?? '',
      website: formValue.website ?? '',
      email: formValue.email ?? '',
      mobile: formValue.mobile ?? '',
      verificationLevel: Number(formValue.verificationLevel),
      regulator: formValue.regulator ?? '',
    };
    this.addServiceService.confirm(data);
  }

  onCancel(): void {
    this.addServiceService.cancel();
  }
}
