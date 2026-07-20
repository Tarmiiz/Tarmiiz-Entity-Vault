import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalUserStateService } from './modal-user-state.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-user-state',
  templateUrl: './modal-user-state.component.html',
  styleUrls: ['./modal-user-state.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalUserStateComponent {

  changeStateService = inject(ModalUserStateService);
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
