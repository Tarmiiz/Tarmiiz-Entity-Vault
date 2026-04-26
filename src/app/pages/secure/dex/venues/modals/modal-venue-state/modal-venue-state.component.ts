import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalVenueStateService } from './modal-venue-state.service';

@Component({
  selector: 'app-modal-venue-state',
  templateUrl: './modal-venue-state.component.html',
  styleUrls: ['./modal-venue-state.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
})
export class ModalVenueStateComponent {
  modalService = inject(ModalVenueStateService);
  private fb = inject(FormBuilder);

  // Allowed transitions: 1→2 (activate), 2↔3, 2/3→4
  allowedTargets = computed<number[]>(() => {
    const cur = this.modalService.currentState();
    if (cur === 1) return [2];
    if (cur === 2) return [3, 4];
    if (cur === 3) return [2, 4];
    return [];
  });

  form = this.fb.group({
    newState: [null as number | null, Validators.required],
  });

  stateLabel(s: number): string {
    switch (s) {
      case 1: return 'Registered';
      case 2: return 'Active';
      case 3: return 'Paused';
      case 4: return 'Deregistered';
      default: return String(s);
    }
  }

  onSave(): void {
    if (this.form.valid && this.form.get('newState')?.value != null) {
      this.modalService.confirm(Number(this.form.get('newState')?.value));
      this.form.reset();
    }
  }

  onCancel(): void {
    this.modalService.cancel();
    this.form.reset();
  }
}
