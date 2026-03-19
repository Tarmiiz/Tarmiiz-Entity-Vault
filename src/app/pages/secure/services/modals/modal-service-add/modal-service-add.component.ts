import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalServiceAddService, AddServiceData } from './modal-service-add.service';
import { RpcService } from '../../../../../shared/services/rpc.service';
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
  private rpcService = inject(RpcService);
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
    this.loadVerificationLevels();
    this.loadRegulators();
  }

  async loadVerificationLevels() {
    await this.rpcService.connectVariablesProxyContract();
    const data = await this.rpcService.getGlobalVariableByCategory('Identity Verification Level');
    if (data.result) {
      this.verificationLevels.set(data.result);
    }
  }

  async loadRegulators() {
    const data = await this.rpcService.regulatorsListByCountry(environment.countryCode, 1, 100);
    if (data.result) {
      this.regulators.set(data.result.regulators.filter((r: any) => r.state));
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
