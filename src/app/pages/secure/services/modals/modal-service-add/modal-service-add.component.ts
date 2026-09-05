import { Component, ChangeDetectionStrategy, inject, signal, effect, computed } from '@angular/core';
import { DECLARABLE_CLASSES, PARTY_CLASS } from '../../../../../shared/constants/party-class';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalServiceAddService, AddServiceData, SELF_CUSTODY_SENTINEL } from './modal-service-add.service';
import { ApiService } from '../../../../../shared/services/api.service';

// The Verification Level picker is hidden in the wizard for now — token-issuer services are fixed at level 2 (eKYC).
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
  allValidators = signal<{ address: string; name: string; validationLevel: number; state: number }[]>([]);
  custodians = signal<{ address: string; name: string; state: number }[]>([]);
  clearingHouses = signal<{ address: string; name: string; state: number }[]>([]);
  readonly SELF_CUSTODY = SELF_CUSTODY_SENTINEL;
  selectedVerificationLevel = signal<number>(Number(DEFAULT_VERIFICATION_LEVEL));

  currentStep = signal<number>(1);
  // Back to 5 for a token provider: the 'Currency & Payments' step is GONE. An entity cannot
  // declare an election (the regulator does, per currency), so there is nothing for the wizard
  // to collect there and no payment provider it could attach.
  totalSteps = computed(() => this.isTokenProvider() ? 5 : 4);
  stepLabels = computed(() => this.isTokenProvider()
    ? ['Configuration', 'Identity', 'Contact', 'Linked Services', 'Review & Confirm']
    : ['Configuration', 'Identity', 'Contact', 'Review & Confirm']
  );
  reviewConfirmed = signal(false);

  validators = computed(() => {
    const level = this.selectedVerificationLevel();
    return this.allValidators().filter(v => !level || v.validationLevel >= level);
  });

  // ── LICENSE APPLICATIONS replace the type/sub-type trio (Phase 28 step (e), 2026-09-03) ────
  //
  // The wizard no longer asks what the service IS; it asks what it APPLIES TO DO. Every entry
  // lands `LICENSE_REQUESTED` and confers nothing until a regulator approves — so this form can
  // never grant, which is precisely the hole `marketClassConfirmed` was bolted on to patch.
  //
  // ⚠️ THE IDS ARE 27/28/29 (Party Class catalog), NOT 1/2/3. The phase record notes 20/21/22
  // were proposed first and `definePartyClasses.js` had already taken them for other classes;
  // 1/2/3 are live party classes too (Validator / Payment Gateway / Bank). A wrong id here does
  // not error — it applies for the wrong license.
  readonly licenseClasses = signal<{ classId: number; name: string }[]>([
    { classId: 27, name: 'Token Issuer' },
    { classId: 28, name: 'Exchange' },
    { classId: 29, name: 'Brokerage' },
  ]);
  selectedLicenses = signal<number[]>([]);
  isLicenseSelected(classId: number): boolean { return this.selectedLicenses().includes(classId); }
  toggleLicense(classId: number): void {
    const cur = this.selectedLicenses();
    this.selectedLicenses.set(cur.includes(classId) ? cur.filter(c => c !== classId) : [...cur, classId]);
  }
  getSelectedLicenseNames(): string {
    const ids = this.selectedLicenses();
    if (!ids.length) return 'None';
    const map = new Map(this.licenseClasses().map(l => [l.classId, l.name]));
    return ids.map(i => map.get(i) ?? `Class ${i}`).join(', ');
  }

  // Drives the step-4 "Linked Services" section, which only makes sense for a would-be token
  // issuer. Reads the APPLICATION, not a granted license — at creation nothing is granted yet,
  // and the alternative (hide the step until a regulator approves) would mean an issuer could
  // never attach a validator during onboarding.
  isTokenProvider = computed(() => this.selectedLicenses().includes(27));
  isServiceProvider = computed(() => false);

  addForm = this.fb.group({

    name: ['', Validators.required],
    description: ['', Validators.required],
    website: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+\..+/)]],
    email: ['', [Validators.required, Validators.email]],
    mobile: ['', [Validators.required, Validators.pattern(/^\+?[0-9\s\-()]{7,20}$/)]],
    verificationLevel: [DEFAULT_VERIFICATION_LEVEL, Validators.required],
    regulator: ['', Validators.required],
    validator: [''],
    paymentProcessor: [''],
    custodian: [SELF_CUSTODY_SENTINEL],
    clearingHouse: [''],
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
          validator: '', paymentProcessor: '', custodian: SELF_CUSTODY_SENTINEL, clearingHouse: '', visibility: 1,
        });
        this.selectedLicenses.set([]);
        this.loadVerificationLevels();
        this.loadRegulators();
        this.loadValidators();
        this.loadClearingHouses();
      }
    });

    this.addForm.get('verificationLevel')!.valueChanges.subscribe(val => {
      this.selectedVerificationLevel.set(Number(val) || 0);
      const current = this.addForm.get('validator')!.value;
      if (current && !this.validators().find(v => v.address === current)) {
        this.addForm.get('validator')!.setValue('');
      }
    });

    // ⚠️ The `serviceType` valueChanges subscriber is GONE with the field (Phase 28 step (e)).
    // What it did — reset the linked-service pickers and toggle the verification-level
    // requirement — now keys on the Token Issuer APPLICATION instead, via `toggleLicense`.
    //
    // ⚠️ ONE BEHAVIOUR IS DELIBERATELY NOT CARRIED OVER: it also cleared validator / PP /
    // custodian / clearingHouse whenever the type changed away from 1. Deselecting the Token
    // Issuer license no longer wipes them, because a selection here is an APPLICATION and an
    // operator toggling a checkbox to re-read it should not silently lose four other choices.
    // The submit path is what guards this: `custodian` and `clearingHouse` are sent only when
    // `isTokenProvider()`, so an unapplied license cannot smuggle them through.
    effect(() => {
      const wantsIssuer = this.isTokenProvider();
      const verificationLevel = this.addForm.get('verificationLevel')!;
      if (wantsIssuer) {
        verificationLevel.setValue(DEFAULT_VERIFICATION_LEVEL);
        verificationLevel.setValidators(Validators.required);
        if (!this.addForm.get('custodian')!.value) {
          this.addForm.get('custodian')!.setValue(SELF_CUSTODY_SENTINEL);
        }
      } else {
        verificationLevel.setValue('');
        verificationLevel.clearValidators();
      }
      verificationLevel.updateValueAndValidity();
    });

    // Refresh endorsed custodians whenever the regulator changes (since the picker is regulator-scoped).
    this.addForm.get('regulator')!.valueChanges.subscribe(val => {
      if (val) this.loadCustodians(val);
      else this.custodians.set([]);
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

  // ⚠️ `loadMarketClasses` REMOVED (Phase 28 step (e), 2026-09-03) with the `Market Class`
  // catalog it read. The license classes are a fixed platform triple (27/28/29) declared on this
  // component, deliberately NOT read from Global Variables like the party classes above:
  // `licenseRequest` validates the class id on chain, and the three MARKET_FAMILY members are a
  // CLOSED SET by design — `MARKET_FAMILY()` in `ILicenses.sol` says so outright, because adding
  // a member silently widens every gate that asks "may this hold or move positions".
  //
  // ⚠️ So if a fourth market license is ever added, this list must be updated DELIBERATELY, in
  // the same pass as that decision. That is the opposite of the reasoning for `loadPartyClasses`
  // above, and the difference is the point: an append-only catalog should be read live; a closed
  // set should not, or it stops being closed.

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

  // Set of the entity's curated, active service-provider addresses for a given type
  // (1=Validator, 2=PaymentProcessor, 3=Custodian, 4=ClearingHouse). Service creation may
  // only pick from this admin-curated subset — enforced on-chain too.
  private async curatedAddresses(spType: number): Promise<Set<string>> {
    const data = await this.apiService.vaultGetServiceProviders(spType, 'active');
    return new Set((data?.providers ?? []).map((p: any) => p.address.toLowerCase()));
  }

  async loadValidators() {
    const [data, curated] = await Promise.all([this.apiService.vaultGetValidators(1, 50), this.curatedAddresses(1)]);
    if (data?.validators) {
      this.allValidators.set(data.validators.filter((v: any) => v.state === 2 && curated.has(v.address.toLowerCase())));
    }
  }

  // ⚠️ There is deliberately NO payment-provider loader here. A payment provider attaches per
  // CURRENCY under a payRole validated against that currency's election, and only the REGULATOR
  // declares an election — so at create time there is nothing to validate a role against and no
  // attachment is possible. Offering a picker would load a list that could never be submitted.

  // Curated + regulator-authorised CCPs, same intersection the detail-page picker applies:
  // ServiceTemplate requires BOTH at seed time, so offering one that fails either would only
  // produce a revert at submit.
  //
  // ⚠️ Keyed by PARTY_CLASS, never a literal. This read `curatedAddresses(4)` — the PRE-SPLIT
  // numbering, where Clearing House was 4. Since BANK was inserted at 3, 4 is CUSTODIAN, so the
  // picker was intersecting clearing houses against the entity's CUSTODIAN-curated set: a
  // genuinely curated CCP never appeared, and a custodian could be offered in its place.
  // `modal-sp-add` carries a comment about fixing exactly this; this file was missed.
  //
  // The endpoint also returns BOTH clearing classes (5 + 6), so narrow to 5 here — an escrow CH
  // is a SEPARATE appointment and attaching one as the entities' CH would revert.
  async loadClearingHouses() {
    const [data, curated] = await Promise.all([
      this.apiService.vaultGetClearingHouses(1, 50),
      this.curatedAddresses(PARTY_CLASS.CLEARING_HOUSE),
    ]);
    if (data?.clearingHouses) {
      this.clearingHouses.set(data.clearingHouses.filter((c: any) =>
        c.state === 2 && Number(c.classId) === PARTY_CLASS.CLEARING_HOUSE && curated.has(c.address.toLowerCase())));
    } else {
      this.clearingHouses.set([]);
    }
  }

  getClearingHouseName(): string {
    const c = this.clearingHouses().find(c => c.address === this.addForm.get('clearingHouse')?.value);
    return c ? (c.name || c.address) : 'None';
  }

  // ⚠️ Keyed by PARTY_CLASS, never a literal — this read `curatedAddresses(3)`, the pre-split id
  // for Custodian. 3 is now BANK, so the picker intersected custodians against the entity's
  // BANK-curated set and a curated custodian never appeared. Twin of the clearing-house fix above.
  async loadCustodians(regulator: string) {
    if (!regulator) { this.custodians.set([]); return; }
    const [data, curated] = await Promise.all([this.apiService.vaultGetEndorsedCustodians(regulator, 1, 50), this.curatedAddresses(PARTY_CLASS.CUSTODIAN)]);
    if (data?.custodians) {
      this.custodians.set(data.custodians.filter((c: any) => (c.state === 2 || c.state === 1 || c.state === true) && curated.has(c.address.toLowerCase())));
    } else {
      this.custodians.set([]);
    }
  }

  getCustodianDisplay(): string {
    const v = this.addForm.get('custodian')?.value;
    if (!v) return 'Not set';
    if (v === SELF_CUSTODY_SENTINEL) return 'Self-custody';
    const match = this.custodians().find(c => c.address === v);
    return match ? (match.name || match.address) : v;
  }

  private stepFields(): string[] {
    const step = this.currentStep();
    if (step === 1) {
      // ⚠️ No license field is listed: the selection is OPTIONAL (an empty array is the legal
      // neutral case on chain), so requiring it here would invent a constraint the contract
      // does not have.
      if (this.isTokenProvider()) return ['verificationLevel', 'regulator'];
      return ['regulator'];
    }
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

  getValidatorName(): string {
    const v = this.validators().find(v => v.address === this.addForm.get('validator')?.value);
    return v ? (v.name || v.address) : 'None';
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
      // ⚠️ The license APPLICATIONS (Phase 28 step (e)). `countryCode: 0` means the service's own
      // country — the sentinel the contract resolves, so the wizard never restates a fact the
      // registry already holds. An empty array is legal and is what an operator who selected
      // nothing gets.
      requestLicenses: this.selectedLicenses().map(classId => ({ classId, countryCode: 0 })),
      regulator: formValue.regulator ?? '',
      validator: formValue.validator ?? '',
      // Always '' — the wizard has no picker for it (see AddServiceData). Kept so the shape
      // stays stable for a future attach-after-declaration flow.
      paymentProcessor: formValue.paymentProcessor ?? '',
      // Custodian is only meaningful for type-1 services. Non-type-1 send empty (treated as unset by the API).
      // ⚠️ Keyed on the Token Issuer APPLICATION now, not `serviceType === 1`. Nothing is granted
      // at creation, so the wizard reads what the operator applied for — the same reasoning as
      // `isTokenProvider`, and the alternative would leave an issuer unable to nominate a
      // custodian during onboarding.
      custodian: this.isTokenProvider() ? (formValue.custodian || SELF_CUSTODY_SENTINEL) : '',
      // Type-1 only, and deliberately NO default: an empty clearing set is the meaningful
      // "this market's credit is final", not an omission to be filled in.
      clearingHouse: this.isTokenProvider() ? (formValue.clearingHouse || '') : '',
      visibility: Number(formValue.visibility) || 1,
    };
    this.addServiceService.confirm(data);
  }

  onCancel(): void {
    this.addServiceService.cancel();
  }
}
