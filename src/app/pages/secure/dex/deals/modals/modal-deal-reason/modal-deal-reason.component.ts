import { Component, ChangeDetectionStrategy, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalDealReasonService } from './modal-deal-reason.service';

@Component({
  selector: 'app-modal-deal-reason',
  templateUrl: './modal-deal-reason.component.html',
  styleUrls: ['./modal-deal-reason.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
})
export class ModalDealReasonComponent {
  modalService = inject(ModalDealReasonService);

  reason = signal('');

  // untracked(): this effect writes a signal it would otherwise re-read, which loops.
  private readonly resetOnOpen = effect(() => {
    if (!this.modalService.isVisible()) return;
    untracked(() => this.reason.set(''));
  });

  /** Only the venue's rejection of an agreed cross demands a stated reason. */
  required = computed(() => this.modalService.kind() === 'venue-reject');

  titleKey = computed(() => ({
    decline:        'dex.deals.reasonModal.titleDecline',
    withdraw:       'dex.deals.reasonModal.titleWithdraw',
    'venue-reject': 'dex.deals.reasonModal.titleVenueReject',
  }[this.modalService.kind()]));

  noteKey = computed(() => ({
    decline:        'dex.deals.reasonModal.noteDecline',
    withdraw:       'dex.deals.reasonModal.noteWithdraw',
    'venue-reject': 'dex.deals.reasonModal.noteVenueReject',
  }[this.modalService.kind()]));

  canSubmit = computed(() => !this.required() || this.reason().trim().length > 0);

  onSubmit(): void {
    if (!this.canSubmit()) return;
    this.modalService.confirm(this.reason().trim());
  }

  onCancel(): void { this.modalService.cancel(); }
}
