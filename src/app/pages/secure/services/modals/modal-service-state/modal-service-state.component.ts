import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalServiceStateService } from './modal-service-state.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-service-state',
  templateUrl: './modal-service-state.component.html',
  styleUrls: ['./modal-service-state.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalServiceStateComponent {

  changeStateService = inject(ModalServiceStateService);
  private apiService = inject(ApiService);
  private fb: FormBuilder = inject(FormBuilder);

  states = signal<{ variableId: number; name: string; }[]>([]);
  
  stateForm = this.fb.group({
    newState: [null as number | null, Validators.required],
  });

  constructor() {
    effect(() => {
      if (this.changeStateService.isVisible()) {
        this.loadStates();
      }
    });
    effect(() => {
      const currentState = this.changeStateService.currentState();
      if (currentState !== null) {
        this.stateForm.get('newState')?.setValue(currentState);
      }
    });
  }
  
  async loadStates() {
    const data = await this.apiService.vaultGetGlobalVariables();
    const excludedIds = [1];
    if (data) {
      this.states.set(
        data
          .filter((item: any) => item.category === 'Account State' && !excludedIds.includes(item.variable_id))
          .map((item: any) => ({ variableId: item.variable_id, name: item.name }))
      );
    }
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
