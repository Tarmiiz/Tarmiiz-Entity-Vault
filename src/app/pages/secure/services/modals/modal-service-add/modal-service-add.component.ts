import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalServiceAddService, AddServiceData } from './modal-service-add.service';
import { RpcService } from '../../../../../shared/services/rpc.service';

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
  }

  async loadVerificationLevels() {
    await this.rpcService.connectVariablesProxyContract();
    const data = await this.rpcService.getGlobalVariableByCategory('Identity Verification Level');
    if (data.result) {
      this.verificationLevels.set(data.result);
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
