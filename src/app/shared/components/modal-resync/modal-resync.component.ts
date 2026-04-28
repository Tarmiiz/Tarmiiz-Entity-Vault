import { Component, ChangeDetectionStrategy, inject, computed, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ModalResyncService } from './modal-resync.service';

@Component({
  selector: 'app-modal-resync',
  templateUrl: './modal-resync.component.html',
  styleUrls: ['./modal-resync.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalResyncComponent {
  resyncService = inject(ModalResyncService);
  private fb = inject(FormBuilder);

  resyncForm = this.fb.group({
    mode: ['both' as 'snapshot' | 'events' | 'both', Validators.required],
    blocksBack: [1000, [Validators.required, Validators.min(1)]],
  });

  targetBlock = computed(() => {
    const blocksBack = this.blocksBackValue();
    const current = this.resyncService.currentBlock();
    return Math.max(1, current - blocksBack);
  });

  showBlocksBack = computed(() => {
    return this.modeValue() === 'events' || this.modeValue() === 'both';
  });

  private blocksBackValue = signal(1000);
  modeValue = signal<'snapshot' | 'events' | 'both'>('both');

  constructor() {
    this.resyncForm.get('blocksBack')?.valueChanges.subscribe((val) => {
      this.blocksBackValue.set(val ?? 1000);
    });

    this.resyncForm.get('mode')?.valueChanges.subscribe((val) => {
      this.modeValue.set(val ?? 'both');
    });

    effect(() => {
      if (this.resyncService.isVisible()) {
        this.resyncForm.patchValue({ mode: 'both', blocksBack: 1000 });
      }
    });
  }

  onSave(): void {
    if (this.resyncForm.valid && !this.resyncService.isSyncing()) {
      const mode = this.resyncForm.get('mode')?.value as 'snapshot' | 'events' | 'both';
      const fromBlock = this.targetBlock();
      this.resyncService.confirm({ mode, fromBlock });
      this.resyncForm.reset({ mode: 'both', blocksBack: 1000 });
    }
  }

  onCancel(): void {
    this.resyncService.cancel();
    this.resyncForm.reset({ mode: 'both', blocksBack: 1000 });
  }
}
