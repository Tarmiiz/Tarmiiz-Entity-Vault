import { Component, ChangeDetectionStrategy, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalRfqCreateService } from './modal-rfq-create.service';

/** Same clock bounds as a deal — a request's expiry IS every child quote's expiry. */
const DEFAULT_TTL_HOURS = 24;
const MIN_TTL_MINUTES = 15;
const MAX_TTL_DAYS = 30;

@Component({
  selector: 'app-modal-rfq-create',
  templateUrl: './modal-rfq-create.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
})
export class ModalRfqCreateComponent {
  modalService = inject(ModalRfqCreateService);

  subscription = signal('');
  dexService   = signal('');
  baseAsset    = signal('');
  side         = signal(1);
  funding      = signal(1);
  amount       = signal<number | null>(null);
  ttlHours     = signal(DEFAULT_TTL_HOURS);
  openToAll    = signal(false);
  invited      = signal<string[]>([]);
  manualDealer = signal('');
  error        = signal('');

  /** untracked() — a tracked read plus a new-reference write here loops forever. */
  private readonly resetOnOpen = effect(() => {
    if (!this.modalService.isVisible()) return;
    untracked(() => {
      const c = this.modalService.ctx();
      this.error.set('');
      this.subscription.set(c.subscriptions[0]?.address ?? '');
      this.dexService.set(c.venues[0]?.address ?? '');
      this.baseAsset.set(c.assets[0]?.address ?? '');
      this.side.set(1);
      this.funding.set(1);
      this.amount.set(null);
      this.ttlHours.set(DEFAULT_TTL_HOURS);
      this.openToAll.set(false);
      this.invited.set([]);
      this.manualDealer.set('');
    });
  });

  isInvited(addr: string): boolean {
    return this.invited().some(a => a.toLowerCase() === addr.toLowerCase());
  }

  toggleInvite(addr: string): void {
    const a = String(addr || '').trim();
    if (!a) return;
    this.invited.update(list => this.isInvited(a) ? list.filter(x => x.toLowerCase() !== a.toLowerCase()) : [...list, a]);
  }

  addManualDealer(): void {
    const a = this.manualDealer().trim();
    if (!a) return;
    if (!this.isInvited(a)) this.invited.update(list => [...list, a]);
    this.manualDealer.set('');
  }

  removeInvite(addr: string): void {
    this.invited.update(list => list.filter(x => x.toLowerCase() !== addr.toLowerCase()));
  }

  onSubmit(): void {
    this.error.set('');
    const amount = Number(this.amount() ?? 0);

    if (!this.subscription()) { this.error.set('dex.rfqs.createModal.errSubscription'); return; }
    if (!this.dexService())   { this.error.set('dex.rfqs.createModal.errVenue');        return; }
    if (!this.baseAsset())    { this.error.set('dex.rfqs.createModal.errAsset');        return; }
    if (!(amount > 0))        { this.error.set('dex.rfqs.createModal.errAmount');       return; }

    // A request nobody may answer is a silent dead end — it would simply sit there
    // and expire unquoted, with nothing to explain why. The API refuses it too.
    if (!this.invited().length && !this.openToAll()) {
      this.error.set('dex.rfqs.createModal.errNoDealers'); return;
    }
    if (this.invited().some(a => a.toLowerCase() === this.subscription().toLowerCase())) {
      this.error.set('dex.rfqs.createModal.errSelfInvite'); return;
    }

    const hours = Number(this.ttlHours() || 0);
    if (hours * 60 < MIN_TTL_MINUTES) { this.error.set('dex.rfqs.createModal.errTtlMin'); return; }
    if (hours > MAX_TTL_DAYS * 24)    { this.error.set('dex.rfqs.createModal.errTtlMax'); return; }

    this.modalService.confirm({
      subscription: this.subscription(),
      dexService:   this.dexService(),
      baseAsset:    this.baseAsset(),
      side:         Number(this.side()),
      funding:      Number(this.funding()),
      amount,
      // Unix SECONDS — the contract's clock. The mirror's expires_at is milliseconds.
      expiresAt:    Math.floor(Date.now() / 1000) + Math.round(hours * 3600),
      openToAll:    this.openToAll(),
      invited:      this.invited(),
    });
  }

  onCancel(): void { this.modalService.cancel(); }
}
