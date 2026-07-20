import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalAssetStateService } from './modal-asset-state.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-asset-state',
  templateUrl: './modal-asset-state.component.html',
  styleUrls: ['./modal-asset-state.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalAssetStateComponent {

  changeStateService = inject(ModalAssetStateService);
  private apiService = inject(ApiService);
  private fb: FormBuilder = inject(FormBuilder);

  states = signal<{ variableId: number; name: string; }[]>([]);
  
  stateForm = this.fb.group({
    newState: [null as number | null, Validators.required],
    reason: [''],
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
          .filter((item: any) => item.category === 'Asset State' && !excludedIds.includes(item.variable_id))
          .map((item: any) => ({ variableId: item.variable_id, name: item.name }))
      );
    }
  }

  onSave(): void {
    if (this.stateForm.valid) {
      const newStateValue = this.stateForm.get('newState')?.value;
      const reason = this.stateForm.get('reason')?.value ?? '';
      if (newStateValue) {
        this.changeStateService.confirm(newStateValue, reason);
      }
    }
  }

  onCancel(): void {
    this.changeStateService.cancel();
  }

}
