import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalServiceFundPartyService } from './modal-service-fund-party.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { PARTY_CLASS } from '../../../../../shared/constants/party-class';

@Component({
  selector: 'app-modal-service-fund-party',
  templateUrl: './modal-service-fund-party.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalServiceFundPartyComponent {

  fundPartyService = inject(ModalServiceFundPartyService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  candidates = signal<{ address: string; name: string; level: number; state: number }[]>([]);

  /** The title / label / empty-text keys differ per role; everything else is shared. */
  i18nBase = computed(() => this.fundPartyService.role() === PARTY_CLASS.FUND_ADMINISTRATOR
    ? 'services.fundPartyModal.fundAdministrator'
    : 'services.fundPartyModal.depositary');

  partyForm = this.fb.group({
    party: [''],
  });

  constructor() {
    effect(() => {
      if (this.fundPartyService.isVisible()) {
        this.partyForm.get('party')?.setValue('');
        this.loadCandidates(this.fundPartyService.role());
      }
    });
  }

  async loadCandidates(role: number) {
    // The regulator's endorsed parties of this class intersected with the entity's own curated
    // set — `ServiceTemplate.partyAttach` requires BOTH (isPartyFor + the curated membership
    // check), so offering one that fails either would only produce a revert. Same shape as the
    // clearing-house picker; the role decides which `/service-providers/available` list is read.
    const [data, curated] = await Promise.all([
      role === PARTY_CLASS.FUND_ADMINISTRATOR
        ? this.apiService.vaultGetFundAdministrators(1, 50).then(d => d?.fundAdministrators)
        : this.apiService.vaultGetDepositaries(1, 50).then(d => d?.depositaries),
      this.apiService.vaultGetServiceProviders(role, 'active'),
    ]);
    const curatedSet = new Set((curated?.providers ?? []).map((p: any) => p.address.toLowerCase()));
    const excluded = new Set(this.fundPartyService.excluded());
    this.candidates.set((data ?? []).filter((c: any) =>
      c.state === 2
      && Number(c.classId) === role
      && curatedSet.has(c.address.toLowerCase())
      && !excluded.has(c.address.toLowerCase())));
  }

  onSave(): void {
    const value = this.partyForm.get('party')?.value ?? '';
    this.fundPartyService.confirm(value);
  }

  onCancel(): void {
    this.fundPartyService.cancel();
  }
}
