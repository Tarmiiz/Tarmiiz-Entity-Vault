import { Component, ChangeDetectionStrategy, inject, signal, effect, computed } from '@angular/core';
import { DECLARABLE_CLASSES } from '../../../../../shared/constants/party-class';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalServiceAddService, AddServiceData } from './modal-service-add.service';
import { ApiService } from '../../../../../shared/services/api.service';

// The Verification Level picker is hidden in the wizard — every service is created at level 2 (eKYC).
const DEFAULT_VERIFICATION_LEVEL = '2';

@Component({
  selector: 'app-modal-service-add',
  templateUrl: './modal-service-add.component.html',
  styleUrls: ['./modal-service-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalServiceAddComponent {

  addServiceService = inject(ModalServiceAddService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  partyClasses = signal<{ variableId: number; name: string }[]>([]);
  verificationLevels = signal<{ variableId: number; name: string }[]>([]);
  regulators = signal<{ address: string; name: string; symbol: string }[]>([]);

  currentStep = signal<number>(1);
  // FOUR steps for every service (2026-09-23). The 'Linked Services' step — validator /
  // custodian / clearing house attached at creation — is GONE with the licence checkboxes that
  // used to reveal it, and it could never have succeeded: `ServiceTemplate.partyAttach` needs an
  // ACTIVE market licence (a new service's is at most REQUESTED) AND the regulator's per-service
  // `grant.entities.provider-attach` row (a service that does not exist yet holds no grant), for
  // every role including validator. Providers attach from the service's own detail page once the
  // regulator has licensed and granted it. (The 'Currency & Payments' step went earlier, for the
  // same kind of reason: the regulator declares the election, so an entity has nothing to set.)
  readonly totalSteps = computed(() => 4);
  readonly stepLabels = computed(() => ['Configuration', 'Identity', 'Contact', 'Review & Confirm']);
  reviewConfirmed = signal(false);

  // ── NO LICENCE APPLICATIONS IN THIS WIZARD (removed 2026-09-23, user ruling) ──────────────
  //
  // Step 1 used to carry three checkboxes (Token Issuer 27 / Exchange 28 / Brokerage 29), each
  // filed as an on-chain APPLICATION inside `serviceCreate`. They were removed because a licence
  // is the REGULATOR's to give, and it has two paths that need nothing from here:
  //   · the regulator grants directly, requested or not — Regulator API
  //     `POST /licenses/subjects/:address/grant` ("Ruling 6");
  //   · the entity applies from the service's own Licenses tab — Entity API
  //     `POST /services/:address/licenses` (withdraw with DELETE).
  // A service is therefore created with `requestLicenses: []`, which the contract treats as the
  // neutral case: it can do nothing a licence gates until one is granted.
  //
  // ⚠️ The Token Issuer box also drove two OTHER things. It revealed the Linked Services step
  // (gone — see `totalSteps`), and it was the only thing keeping the verification level at its
  // default: unticked, an effect CLEARED the level, so an unlicensed service was created at 0.
  // The level is now always the default, because it is the minimum KYC claim
  // `SubscriptionCreateLib` demands of EVERY subscriber, whatever the service does.

  addForm = this.fb.group({

    name: ['', Validators.required],
    description: ['', Validators.required],
    website: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+\..+/)]],
    email: ['', [Validators.required, Validators.email]],
    mobile: ['', [Validators.required, Validators.pattern(/^\+?[0-9\s\-()]{7,20}$/)]],
    verificationLevel: [DEFAULT_VERIFICATION_LEVEL, Validators.required],
    regulator: ['', Validators.required],
    visibility: [1, Validators.required],
  });

  constructor() {
    effect(() => {
      if (this.addServiceService.isVisible()) {
        this.currentStep.set(1);
        this.reviewConfirmed.set(false);
        this.addForm.reset({
          name: '', description: '', website: '',
          email: '', mobile: '', verificationLevel: DEFAULT_VERIFICATION_LEVEL, regulator: '',
          visibility: 1,
        });
        this.loadVerificationLevels();
        this.loadRegulators();
      }
    });
  }

  // ⚠️ `loadServiceTypes` REMOVED (Phase 28 step (e)). It filtered Global Variables on the
  // `'Service Type'` category, which is RETIRED and no longer seeded — so this had already
  // become the failure its neighbour's comment warns about: a filter matching nothing, an empty
  // dropdown, no error and no clue.

  // The 'License Class' catalog (18 entries) is far broader than what a service may DECLARE
  // itself as: only the ATTACH BAND — ids 1..6, Validator / Payment Gateway / Bank / Custodian
  // / Clearing House / Escrow Clearing House — attaches to a service. Everything above is
  // either an asset-level role or an operator class that is held by a contract, with no
  // `partyClass` declaration meaning at all.
  //
  // ⚠️ THE BOUND IS THE CONTRACT'S — and it is the DECLARATION band, not the attachment one.
  // `isDeclarablePartyClass` in the Entities Registry's IServiceTemplate.sol is the single
  // source; this mirrors it. Offering anything outside it produces a revert at submit; setting
  // it NARROWER silently hides valid choices, which has now happened twice — once while it read
  // 4 (the band had widened to 6 with the clearing houses) and once at 6 (the party classes were
  // completed and the band became 1..14 plus 19).
  //
  // It is a SET, not a max, because 19 is not contiguous with 14: `Consultant` was APPENDED to
  // the catalog rather than inserted into the asset band, so that no existing id moved. A
  // `<= MAX` test is not merely inelegant here, it is wrong — and wrong by omission, which shows
  // up as a choice missing from a dropdown rather than as an error.
  //
  // ⚠️ Do NOT narrow this to the 1..6 service-attachment band. Three bands exist and this is the
  // widest: what a service may DECLARE ITSELF AS. What may ATTACH TO a service is 1..6
  // (ServicePartiesLib); what may attach to an ASSET is 9..14 plus 19. An appraiser declares
  // class 9 and attaches to an asset — it must appear here and must never appear in a service's
  // party picker.

  // ⚠️ THIS CATEGORY HAS BEEN RENAMED TWICE, AND THE FIRST TIME IT BROKE THIS EXACT FILTER.
  //   'Regulator Party Type' → 'Party Class'  — the old name stopped existing on chain, this
  //     filter matched nothing, and the dropdown came up EMPTY: no error, no clue, just a wizard
  //     that could not be completed.
  //   'Party Class' → 'License Class'         — Phase 28.1, 2026-09-03. Done ATOMICALLY with all
  //     35 sites (28 GV seeds, 5 API reads, 1 SQL join, this constant) precisely because of the
  //     incident above.
  //
  // 🔴 The constant is named for what it HOLDS, not for what it once held — it read
  // `PARTY_CLASS_CATEGORY` while containing 'License Class', which is the stale-name shape this
  // platform keeps finding in mirrors. Read the name from the live catalog; never reintroduce a
  // retired one.
  //
  // ⚠️ AND DO NOT RENAME THE `'Audit Category'` VALUE 'Party Class' TO MATCH — it is a DIFFERENT
  // namespace naming a class-DEFINITION event, and it deliberately did not follow. Both notes are
  // in `Global Variables/scripts/2.initiate.js`.
  private static readonly LICENSE_CLASS_CATEGORY = 'License Class';

  async loadPartyClasses() {
    const data = await this.apiService.vaultGetGlobalVariables();
    if (data) {
      this.partyClasses.set(
        data
          .filter((item: any) => item.category === ModalServiceAddComponent.LICENSE_CLASS_CATEGORY
            && DECLARABLE_CLASSES.includes(Number(item.variable_id)))
          .map((item: any) => ({ variableId: item.variable_id, name: item.name }))
      );
    }
  }

  async loadVerificationLevels() {
    const data = await this.apiService.vaultGetGlobalVariables();
    if (data) {
      this.verificationLevels.set(
        data
          .filter((item: any) => item.category === 'Identity Verification Level')
          .map((item: any) => ({ variableId: item.variable_id, name: item.name }))
      );
    }
  }

  async loadRegulators() {
    const entityInfo = await this.apiService.vaultGetEntityInfo();
    const countryCode = String((entityInfo as any)?.country_code ?? '');
    const data = await this.apiService.vaultGetRegulatorsByCountry(countryCode, 0, 100);
    if (data) {
      this.regulators.set(data.filter((r: any) => r.state).map((r: any) => ({ address: r.address, name: r.name, symbol: r.symbol })));
    }
  }

  private stepFields(): string[] {
    const step = this.currentStep();
    if (step === 1) return ['verificationLevel', 'regulator'];
    if (step === 2) return ['name', 'description'];
    if (step === 3) return ['website', 'email', 'mobile'];
    return [];
  }

  isCurrentStepValid(): boolean {
    return this.stepFields().every(f => this.addForm.get(f)?.valid);
  }

  nextStep(): void {
    if (!this.isCurrentStepValid()) {
      this.stepFields().forEach(f => this.addForm.get(f)?.markAsTouched());
      return;
    }
    if (this.currentStep() < this.totalSteps()) {
      this.reviewConfirmed.set(false);
      this.currentStep.set(this.currentStep() + 1);
    }
  }

  prevStep(): void {
    if (this.currentStep() > 1) {
      this.currentStep.set(this.currentStep() - 1);
    }
  }


  getVerificationLevelName(): string {
    return this.verificationLevels().find(l => l.variableId === Number(this.addForm.get('verificationLevel')?.value))?.name ?? '';
  }

  getRegulatorDisplay(): string {
    const reg = this.regulators().find(r => r.address === this.addForm.get('regulator')?.value);
    return reg ? `${reg.name} (${reg.symbol})` : '';
  }

  async fillFromEntity(): Promise<void> {
    const info: any = await this.apiService.vaultGetEntityInfo();
    if (!info) return;
    // Entity contact lives under the nested `contact` key (the API deletes the legacy flat
    // email/mobile/website keys on every metadata write). `/vault/entity/info` spreads the
    // parsed metadata onto the row, so read from the row first, then the raw metadata blob.
    let meta: any = {};
    try {
      meta = typeof info.metadata === 'string' ? JSON.parse(info.metadata) : (info.metadata ?? {});
    } catch { /* non-JSON metadata — fall back to the spread row fields */ }
    const c = (info.contact && typeof info.contact === 'object') ? info.contact
            : (meta.contact && typeof meta.contact === 'object') ? meta.contact
            : {};
    this.addForm.patchValue({
      website: c.website ?? meta.website ?? '',
      email:   c.email   ?? meta.email   ?? '',
      mobile:  c.phone   ?? meta.telephone ?? meta.mobile ?? '',
    });
  }

  onSave(): void {
    if (this.addForm.invalid || !this.reviewConfirmed()) return;

    const formValue = this.addForm.getRawValue();
    const data: AddServiceData = {
      name: formValue.name ?? '',
      description: formValue.description ?? '',
      website: formValue.website ?? '',
      email: formValue.email ?? '',
      mobile: formValue.mobile ?? '',
      verificationLevel: Number(formValue.verificationLevel),
      // No licence applications at creation (see the note above `addForm`): the regulator grants,
      // or the entity applies from the service's Licenses tab. `[]` is the contract's neutral case.
      requestLicenses: [],
      regulator: formValue.regulator ?? '',
      // Nothing is attachable at creation (see `totalSteps`), so no provider travels with the
      // create. The fields stay in `AddServiceData` because the Entity API route still accepts
      // them; empty means "attach nothing".
      validator: '',
      paymentProcessor: '',
      custodian: '',
      clearingHouse: '',
      visibility: Number(formValue.visibility) || 1,
    };
    this.addServiceService.confirm(data);
  }

  onCancel(): void {
    this.addServiceService.cancel();
  }
}
