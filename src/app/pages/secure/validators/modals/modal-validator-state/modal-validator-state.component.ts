import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalValidatorStateService } from './modal-validator-state.service';
import { RpcService } from '../../../../../shared/services/rpc.service';

@Component({
  selector: 'app-modal-validator-state',
  templateUrl: './modal-validator-state.component.html',
  styleUrls: ['./modal-validator-state.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalValidatorStateComponent {

  changeStateService = inject(ModalValidatorStateService);
  private rpcService = inject(RpcService);
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
    await this.rpcService.connectGlobalVariables();
    const data = await this.rpcService.getGlobalVariableByCategory('cKYC Validator State');
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
