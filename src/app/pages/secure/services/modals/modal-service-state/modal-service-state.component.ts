import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalServiceStateService } from './modal-service-state.service';
import { RpcService } from '../../../../../shared/services/rpc.service';

@Component({
  selector: 'app-modal-service-state',
  templateUrl: './modal-service-state.component.html',
  styleUrls: ['./modal-service-state.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalServiceStateComponent {

  changeStateService = inject(ModalServiceStateService);
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
    await this.rpcService.connectVariablesProxyContract();
    const data = await this.rpcService.getGlobalVariableByCategory('Account State');
    const excludedIds = [1];
    this.states.set(data.result.filter((item: any) => !excludedIds.includes(item.variableId)));
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
