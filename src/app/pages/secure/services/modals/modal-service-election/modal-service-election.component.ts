import { Component, ChangeDetectionStrategy, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  ModalServiceElectionService,
  ELECTION_ONC,
  ELECTION_OFFC,
  ELECTION_MIGRATING,
  PAY_ROLE_MINTER,
  payRoleForElection,
} from './modal-service-election.service';

/**
 * Declares the onc / offc election for ONE currency, or requests a switch of one already declared.
 *
 * The election is PER CURRENCY (a service can be onc in EGP and offc in USD), so this modal always
 * resolves to a (currencyCode, election) PAIR — never an election alone.
 *
 * The payment role is DERIVED from the election, never chosen: onc mints, offc records. It is shown
 * here so the operator sees the consequence of the choice before confirming, but it is not an input
 * and is not part of the result — the caller derives it with `payRoleForElection` at attach time.
 *
 * Literal English strings, no TranslatePipe — matches the services detail page's Election tab,
 * which this modal is opened from.
 */
@Component({
  selector: 'app-modal-service-election',
  templateUrl: './modal-service-election.component.html',
  styleUrls: ['./modal-service-election.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class ModalServiceElectionComponent {

  modal = inject(ModalServiceElectionService);

  // Exposed for the template's radio [value] bindings.
  readonly ELECTION_ONC = ELECTION_ONC;
  readonly ELECTION_OFFC = ELECTION_OFFC;

  /** 0 = nothing chosen. Not a real currency code — ISO numeric codes start at 8. */
  currencyCode = signal<number>(0);
  /** 0 = nothing chosen; only ELECTION_ONC / ELECTION_OFFC are selectable. */
  election = signal<number>(0);

  isSwitch = computed(() => this.modal.mode() === 'switch');

  /**
   * Reset on open. Wrapped in untracked() because the body writes signals this effect also reads —
   * tracked, that re-triggers forever and hangs the UI (the standing modal open-effect trap).
   */
  private readonly resetOnOpen = effect(() => {
    if (!this.modal.isVisible()) return;
    untracked(() => {
      const input = this.modal.input();
      // Never pre-select an election, in either mode. This is a consequential, hard-to-reverse
      // declaration; a default would be a recommendation the platform is not making.
      this.election.set(0);
      this.currencyCode.set(this.modal.mode() === 'switch' ? Number(input.currencyCode ?? 0) : 0);
    });
  });

  // ── Switch-mode context ────────────────────────────────────────────────────────────────────
  currentElection = computed(() => Number(this.modal.input().currentElection ?? 0));

  /**
   * A migration already running is a hard block, not a warning: the currency is frozen for payment
   * legs until every subscription is converted, and a second switch has nothing coherent to mean.
   */
  migrationInFlight = computed(() => this.isSwitch() && this.currentElection() === ELECTION_MIGRATING);

  /** The fixed currency's display name in switch mode (falls back to the bare code). */
  fixedCurrencyLabel = computed(() => {
    const code = this.currencyCode();
    const match = this.modal.input().currencies.find(c => Number(c.currencyCode) === code);
    return match?.currencyName ? `${match.currencyName} (${code})` : String(code || '—');
  });

  // Same vocabulary as the Election tab behind this modal, so the two never disagree.
  electionLabel(v: number): string {
    return ({ 1: 'onc', 2: 'offc', 3: 'migrating' } as Record<number, string>)[Number(v)] || 'undeclared';
  }

  // ── The derived consequence, shown before confirming ───────────────────────────────────────
  /** Empty until a valid election is picked — `payRoleForElection` has no honest answer for 0 or 3. */
  derivedPayRoleLabel = computed(() => {
    const el = this.election();
    if (el !== ELECTION_ONC && el !== ELECTION_OFFC) return '';
    return payRoleForElection(el) === PAY_ROLE_MINTER ? 'Minter' : 'Rail';
  });

  derivedPayRoleHint = computed(() => {
    const el = this.election();
    if (el !== ELECTION_ONC && el !== ELECTION_OFFC) return '';
    return el === ELECTION_ONC
      ? 'Fiat lands in this channel\'s reserve and the provider mints credit against it.'
      : 'The provider moves real fiat; credit only records that the movement happened.';
  });

  canConfirm = computed(() => {
    const el = this.election();
    if (el !== ELECTION_ONC && el !== ELECTION_OFFC) return false;
    if (!this.currencyCode()) return false;
    if (this.isSwitch()) {
      if (this.migrationInFlight()) return false;
      // A switch to the election already in force is a no-op the contract would reject.
      if (el === this.currentElection()) return false;
    }
    return true;
  });

  onConfirm(): void {
    if (!this.canConfirm()) return;
    this.modal.confirm({ currencyCode: this.currencyCode(), election: this.election() });
  }

  onCancel(): void { this.modal.cancel(); }
}
