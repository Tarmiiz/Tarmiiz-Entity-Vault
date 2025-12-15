import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalcKYCValidatorStateService } from '../modal-ckyc-validator-state.service';
import { RpcService } from '../../../../../../shared/services/rpc.service';
import { RpcGVService } from '../../../../../../shared/services/rpc-gv.service';

@Component({
  selector: 'app-modal-ckyc-validator-state',
  templateUrl: './modal-ckyc-validator-state.component.html',
  styleUrls: ['./modal-ckyc-validator-state.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalCkycValidatorStateComponent {

  changeStateService = inject(ModalcKYCValidatorStateService);
  private rpcService = inject(RpcService);
  private rpcGVService = inject(RpcGVService);
  private fb: FormBuilder = inject(FormBuilder);

  states = signal<{ variableId: number; name: string; }[]>([]);
  
  stateForm = this.fb.group({
    newState: [null as number | null, Validators.required],
  });

  constructor() {
    this.loadStates();
    effect(() => {
      const currentState = this.changeStateService.currentState();
      if (currentState !== null) {
        this.stateForm.get('newState')?.setValue(currentState);
      }
    });
  }
  
  async loadStates() {
    await this.rpcGVService.connectGlobalVariables();
    const data = await this.rpcGVService.getGlobalVariableByCategory('cKYC Validator State');
    this.states.set(data.result);
  }

  onSave(): void {
    if (this.stateForm.valid) {
      const newStateValue = this.stateForm.get('newState')?.value;
      if (newStateValue) {
        this.changeStateService.confirm(newStateValue);
      }
    }
  }

  onCancel(): void {
    this.changeStateService.cancel();
  }

}
