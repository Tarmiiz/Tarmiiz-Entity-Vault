import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalAssetServiceStateService } from './modal-asset-service-state.service';

@Component({
  selector: 'app-modal-asset-service-state',
  templateUrl: './modal-asset-service-state.component.html',
  styleUrls: ['./modal-asset-service-state.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
})
export class ModalAssetServiceStateComponent {

  stateService = inject(ModalAssetServiceStateService);
  private fb = inject(FormBuilder);

  readonly states = [
    { value: 3, label: 'Suspended' },
    { value: 4, label: 'Exit Only' },
    { value: 5, label: 'Deactivated' },
  ];

  stateForm = this.fb.group({
    newState: [null as number | null, Validators.required],
    reason: [''],
  });

  constructor() {
    effect(() => {
      const ctx = this.stateService.context();
      if (ctx !== null) {
        this.stateForm.get('newState')?.setValue(ctx.currentState);
      }
    });
  }

  onSave(): void {
    const newState = this.stateForm.get('newState')?.value;
    const reason = this.stateForm.get('reason')?.value ?? '';
    if (newState !== null && newState !== undefined) {
      this.stateService.confirm(newState, reason);
    }
  }

  onCancel(): void {
    this.stateService.cancel();
  }
}
