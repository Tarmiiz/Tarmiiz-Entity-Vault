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

  serviceTypes = signal<{ variableId: number; name: string }[]>([]);
  partyClasses = signal<{ variableId: number; name: string }[]>([]);
  marketClasses = signal<{ variableId: number; name: string }[]>([]);
  verificationLevels = signal<{ variableId: number; name: string }[]>([]);
  regulators = signal<{ address: string; name: string; symbol: string }[]>([]);
  allValidators = signal<{ address: string; name: string; validationLevel: number; state: number }[]>([]);
  custodians = signal<{ address: string; name: string; state: number }[]>([]);
  clearingHouses = signal<{ address: string; name: string; state: number }[]>([]);
  readonly SELF_CUSTODY = SELF_CUSTODY_SENTINEL;
  selectedVerificationLevel = signal<number>(Number(DEFAULT_VERIFICATION_LEVEL));
  selectedServiceType = signal<number>(0);

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

  // serviceType 1 = Token Provider (renamed from "Token Issuer" — two of its three market
  // classes issue nothing). The entity DECLARES its `marketClass` here; the regulator confirms
  // it separately, and the DEX gates read the CONFIRMATION, never the declaration.
  isTokenProvider = computed(() => this.selectedServiceType() === 1);
  // serviceType 2 = Service Provider. The entity DECLARES its sub-type (partyClass) here;
  // the regulator confirms it later, after which it appears under that regulator's
  // validators / payment processors / custodians / clearing houses list.
  isServiceProvider = computed(() => this.selectedServiceType() === 2);

  addForm = this.fb.group({
    serviceType: ['', Validators.required],
    partyClass: [''],
    marketClass: [''],
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
          serviceType: '', partyClass: '', marketClass: '', name: '', description: '', website: '',
          email: '', mobile: '', verificationLevel: DEFAULT_VERIFICATION_LEVEL, regulator: '',
          validator: '', paymentProcessor: '', custodian: SELF_CUSTODY_SENTINEL, clearingHouse: '', visibility: 1,
        });
        this.loadServiceTypes();
        this.loadPartyClasses();
        this.loadMarketClasses();
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

    this.addForm.get('serviceType')!.valueChanges.subscribe(val => {
      this.selectedServiceType.set(Number(val) || 0);
      const verificationLevel = this.addForm.get('verificationLevel')!;
      const partyClass = this.addForm.get('partyClass')!;
      const marketClass = this.addForm.get('marketClass')!;
      if (Number(val) !== 1) {
        this.addForm.get('validator')!.setValue('');
        this.addForm.get('paymentProcessor')!.setValue('');
        this.addForm.get('custodian')!.setValue('');
        this.addForm.get('clearingHouse')!.setValue('');
        // Verification level only applies to token-issuer services — drop the requirement for others.
        verificationLevel.setValue('');
        verificationLevel.clearValidators();
        verificationLevel.updateValueAndValidity();
      } else {
        // The picker is hidden, so re-apply the fixed default whenever we come back to token issuer.
        verificationLevel.setValue(DEFAULT_VERIFICATION_LEVEL);
        verificationLevel.setValidators(Validators.required);
        verificationLevel.updateValueAndValidity();
        // Default type-1 services to self-custody and refresh endorsed custodian list.
        if (!this.addForm.get('custodian')!.value) {
          this.addForm.get('custodian')!.setValue(SELF_CUSTODY_SENTINEL);
        }
      }
      // Each half of the axis carries its OWN sub-type, and exactly one is ever set.
      // partyClass is required ONLY for service providers (serviceType 2)…
      if (Number(val) === 2) {
        partyClass.setValidators(Validators.required);
      } else {
        partyClass.setValue('');
        partyClass.clearValidators();
      }
      partyClass.updateValueAndValidity();
      // …and marketClass ONLY for token providers (serviceType 1), where it is MANDATORY:
      // 0 is not a legal marketClass on a type-1 service, so there is no "unset" to fall back
      // to. Deliberately NOT pre-selected from `features.vaultMode` — Entity Mode is a
      // per-tenant menu choice and may legitimately disagree with a per-service declaration
      // (a mode-1 tenant running one Issuer and one Exchange service is normal).
      if (Number(val) === 1) {
        marketClass.setValidators(Validators.required);
      } else {
        marketClass.setValue('');
        marketClass.clearValidators();
      }
      marketClass.updateValueAndValidity();
    });

    // Refresh endorsed custodians whenever the regulator changes (since the picker is regulator-scoped).
    this.addForm.get('regulator')!.valueChanges.subscribe(val => {
      if (val) this.loadCustodians(val);
      else this.custodians.set([]);
    });
  }

  async loadServiceTypes() {
    const data = await this.apiService.vaultGetGlobalVariables();
    if (data) {
      this.serviceTypes.set(
        data
          .filter((item: any) => item.category === 'Service Type')
          .map((item: any) => ({ variableId: item.variable_id, name: item.name }))
      );
    }
  }

  // The 'Party Class' catalog (18 entries) is far broader than what a service may DECLARE
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

  // ⚠️ The category was RENAMED from 'Regulator Party Type' to 'Party Class'. The old name no
  // longer exists on chain, so this filter matched nothing and the dropdown came up EMPTY —
  // no error, no clue, just a wizard that could not be completed. Read the name from the live
  // catalog; never reintroduce the retired one.
  private static readonly PARTY_CLASS_CATEGORY = 'Party Class';
  private static readonly MARKET_CLASS_CATEGORY = 'Market Class';

  async loadPartyClasses() {
    const data = await this.apiService.vaultGetGlobalVariables();
    if (data) {
      this.partyClasses.set(
        data
          .filter((item: any) => item.category === ModalServiceAddComponent.PARTY_CLASS_CATEGORY
            && DECLARABLE_CLASSES.includes(Number(item.variable_id)))
          .map((item: any) => ({ variableId: item.variable_id, name: item.name }))
      );
    }
  }

  // ⚠️ NO `MAX_REGISTRABLE_*` BOUND HERE, AND THAT IS DELIBERATE — do not copy the bounded
  // filter from `loadPartyClasses` above. The `Party Class` catalog is far broader than what a
  // service may declare itself as (ids 7+ are asset-level roles and operator classes held by a
  // contract), so that method filters to the 1..6 ATTACH BAND. `Market Class` has no such
  // split: the WHOLE catalog is a legal `marketClass` for a type-1 service, and it is
  // append-only on chain — so reading it live means a future value ships with no rebuild,
  // while a bound copied from the neighbour would silently hide it.
  async loadMarketClasses() {
    const data = await this.apiService.vaultGetGlobalVariables();
    if (data) {
      this.marketClasses.set(
        data
          .filter((item: any) => item.category === ModalServiceAddComponent.MARKET_CLASS_CATEGORY)
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
      if (this.isTokenProvider()) return ['serviceType', 'marketClass', 'verificationLevel', 'regulator'];
      if (this.isServiceProvider()) return ['serviceType', 'partyClass', 'regulator'];
      return ['serviceType', 'regulator'];
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

  getServiceTypeName(): string {
    return this.serviceTypes().find(s => s.variableId === Number(this.addForm.get('serviceType')?.value))?.name ?? '';
  }

  getPartyClassName(): string {
    return this.partyClasses().find(p => p.variableId === Number(this.addForm.get('partyClass')?.value))?.name ?? '';
  }

  getMarketClassName(): string {
    return this.marketClasses().find(m => m.variableId === Number(this.addForm.get('marketClass')?.value))?.name ?? '';
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
      serviceType: Number(formValue.serviceType),
      // The two declared sub-types — exactly one is ever non-zero, matching the on-chain
      // invariant (`partyClass != 0 ⟺ type 2`, `marketClass != 0 ⟺ type 1`). Sending both
      // would be rejected by the creation matrix rather than merged.
      partyClass: Number(formValue.serviceType) === 2 ? Number(formValue.partyClass) : 0,
      marketClass: Number(formValue.serviceType) === 1 ? Number(formValue.marketClass) : 0,
      regulator: formValue.regulator ?? '',
      validator: formValue.validator ?? '',
      // Always '' — the wizard has no picker for it (see AddServiceData). Kept so the shape
      // stays stable for a future attach-after-declaration flow.
      paymentProcessor: formValue.paymentProcessor ?? '',
      // Custodian is only meaningful for type-1 services. Non-type-1 send empty (treated as unset by the API).
      custodian: Number(formValue.serviceType) === 1 ? (formValue.custodian || SELF_CUSTODY_SENTINEL) : '',
      // Type-1 only, and deliberately NO default: an empty clearing set is the meaningful
      // "this market's credit is final", not an omission to be filled in.
      clearingHouse: Number(formValue.serviceType) === 1 ? (formValue.clearingHouse || '') : '',
      visibility: Number(formValue.visibility) || 1,
    };
    this.addServiceService.confirm(data);
  }

  onCancel(): void {
    this.addServiceService.cancel();
  }
}
