import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ModalAddSubscriptionService } from './modal-add-subscription.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import {
  EKYC_ID_TYPES, EKYC_FIELD_RULES, EKYC_FIELD_LABELS,
  ekycRuleApplies, ekycRequiredFieldsForLevel,
} from '../../../../../shared/constants/ekyc-canonical';

// A token issuer is a service HOLDING licence class 27 — Phase 28 retired `serviceType`, so
// there is no byte that says so. Same spelling as `modal-transaction-add.component.ts` and
// `modal-asset-add.component.ts` rather than inventing a second name for the same fact.
const CLASS_TOKEN_ISSUER = 27;

// The optional canonical identity-data fields (beyond the base required set handled
// explicitly) — driven by the GENERATED mirror of the platform canonical schema v3
// (shared/constants/ekyc-canonical.ts; unknown keys are dropped server-side).
const CANONICAL_EXTRA_FIELDS = [
  'nameFirst', 'nameLast', 'gender', 'dateOfBirth', 'maritalStatus', 'religion',
  'profession', 'husbandName', 'nationalIdSerial', 'idReleaseDate', 'idExpiryDate',
  'addressStreet', 'addressDistrict', 'addressGovernorate', 'birthGovernorate',
  'nationality', 'placeOfBirth', 'issuingCountry', 'issuingAuthority',
  'addressCity', 'addressPostalCode', 'addressCountry',
] as const;

@Component({
  selector: 'app-modal-add-subscription',
  templateUrl: './modal-add-subscription.component.html',
  styleUrls: ['./modal-add-subscription.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
})
export class ModalAddSubscriptionComponent {
  modalService = inject(ModalAddSubscriptionService);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private fb = inject(FormBuilder);
  private translate = inject(TranslateService);

  mode = signal<'A' | 'B'>('A');
  services = signal<{ address: string; name: string }[]>([]);
  countries = signal<{ countryCode: number; name: string }[]>([]);
  // Validators attached to the selected service (1:N). Mode B (new identity from a
  // caller-supplied canonical eKYC result) picks the PROVIDER — the attached validator
  // service that performed the verification. Mode A (existing DID) needs no provider.
  serviceValidators = signal<{ address: string; active: boolean }[]>([]);
  showMoreIdentity = signal(false);

  // ID document types — mirror of Global Variables 'ID Type - Individual'.
  readonly idTypes = Object.entries(EKYC_ID_TYPES).map(([value, label]) => ({ value: Number(value), label }));

  form = this.fb.group({
    service: ['', Validators.required],
    // Mode A
    didHash: [''],
    // Mode B — provider envelope (the SP that ran the verification)
    provider: [''],
    providerName: [''],
    providerTrxRefNo: [''],
    providerTrxTime: [''],
    // Mode B — subscriber
    idType: [1 as number | null],
    uniqueId: [''],
    email: [''],
    mobile: [''],
    didType: [1 as number | null],
    countryCode: [null as number | null],
    level: [2 as number | null],
    acceptExpired: [false],
    // Mode B — canonical identity data (idNumber is auto-filled from uniqueId)
    nameFull: [''],
    nameFirst: [''],
    nameLast: [''],
    gender: [''],
    dateOfBirth: [''],
    maritalStatus: [''],
    religion: [''],
    profession: [''],
    husbandName: [''],
    nationalIdSerial: [''],
    idReleaseDate: [''],
    idExpiryDate: [''],
    addressStreet: [''],
    addressDistrict: [''],
    addressGovernorate: [''],
    birthGovernorate: [''],
    nationality: [''],
    placeOfBirth: [''],
    issuingCountry: [''],
    issuingAuthority: [''],
    addressCity: [''],
    addressPostalCode: [''],
    addressCountry: [''],
  });

  constructor() {
    effect(() => {
      if (this.modalService.isVisible()) {
        this.resetForm();
        this.loadServices();
        this.loadCountries();
      }
    });
    // Reload the attached-validator (provider) picker whenever the selected service changes.
    this.form.get('service')!.valueChanges.subscribe((svc) => this.loadServiceValidators(svc || ''));
  }

  private async loadServiceValidators(service: string) {
    this.form.patchValue({ provider: '' }, { emitEvent: false });
    if (!service) { this.serviceValidators.set([]); return; }
    const parties = await this.apiService.vaultGetServiceParties(service);
    const validators = parties?.validators ?? [];
    this.serviceValidators.set(validators);
    if (validators.length === 1) this.form.patchValue({ provider: validators[0].address }, { emitEvent: false });
  }

  private resetForm() {
    this.mode.set('A');
    this.serviceValidators.set([]);
    this.showMoreIdentity.set(false);
    this.form.reset({
      service: '',
      didHash: '',
      provider: '',
      providerName: '',
      providerTrxRefNo: '',
      providerTrxTime: '',
      idType: 1,
      uniqueId: '',
      email: '',
      mobile: '',
      didType: 1,
      countryCode: null,
      level: 2,
      acceptExpired: false,
      nameFull: '',
      nameFirst: '', nameLast: '', gender: '', dateOfBirth: '', maritalStatus: '',
      religion: '', profession: '', husbandName: '', nationalIdSerial: '',
      idReleaseDate: '', idExpiryDate: '', addressStreet: '', addressDistrict: '',
      addressGovernorate: '', birthGovernorate: '',
      nationality: '', placeOfBirth: '', issuingCountry: '', issuingAuthority: '',
      addressCity: '', addressPostalCode: '', addressCountry: '',
    });
  }

  async loadServices() {
    const data = await this.apiService.vaultGetServicesOwn(0, 200);
    if (data?.services) {
      this.services.set(
        data.services
          // ⚠️ WAS `Number(s.service_type) === 1` — RETIRED BY PHASE 28 step (e), so this read
          // `Number(undefined) === 1`, was permanently false, and the Service dropdown came back
          // EMPTY on a tenant holding an active Token Issuer licence. Nothing threw, at any point:
          // the operator opens Add Subscription and the only option is the placeholder, which reads
          // as "this entity has no services" rather than as a broken filter. This was the LAST
          // surviving `service_type` filter in the Vault — the twin at
          // `modal-transaction-add.component.ts` had the identical bug, already fixed.
          //
          // `license_class_ids` is the ACTIVE licence set from the Entity API's `getServices`, so a
          // suspended licence correctly drops the service out of the list.
          .filter((s: any) => (s.license_class_ids ?? []).includes(CLASS_TOKEN_ISSUER)
                           && Number(s.state) === 2)
          .map((s: any) => ({ address: s.address, name: s.name || s.address }))
      );
    }
  }

  async loadCountries() {
    const list = await this.apiService.vaultGetCountries();
    if (list) {
      this.countries.set(
        list
          .map((c: any) => ({
            countryCode: c.country_code ?? c.countryCode,
            name: c.name_short ?? c.name_full ?? c.name ?? String(c.country_code ?? ''),
          }))
          .filter((c: any) => c.countryCode != null)
      );
    }
  }

  setMode(mode: 'A' | 'B') {
    this.mode.set(mode);
  }

  toggleMoreIdentity() {
    this.showMoreIdentity.set(!this.showMoreIdentity());
  }

  private isModeAValid(): boolean {
    return !!(this.form.value.service && this.form.value.didHash);
  }

  /**
   * Is this canonical field mandatory for the currently-chosen document type?
   * Driven by the GENERATED `EKYC_FIELD_RULES` table, so the marker follows the
   * schema instead of being re-derived here. Replaces the old `isPassport()`, which
   * hard-coded "passports also need nationality" — true under v3 and wrong under v4,
   * where nationality is mandatory for every document type.
   */
  isRequired(field: string): boolean {
    return ekycRuleApplies(EKYC_FIELD_RULES[field], Number(this.form.value.idType) || 1);
  }

  /**
   * Canonical fields the API will reject for the chosen document type, resolved from
   * the same generated table the server walks. A hand-copy of the rules is exactly how
   * v3's set got stranded in this modal when v4 raised it — and the failure mode is the
   * worst available: the operator completes the whole form and the API rejects at submit.
   */
  private missingCanonicalFields(): string[] {
    const v = this.form.value as Record<string, any>;
    const idType = Number(v['idType']) || 1;
    return ekycRequiredFieldsForLevel(Number(v['level']) || 2, idType).filter(f => {
      if (f === 'idType') { return false; }                                  // its own control, checked below
      if (f === 'idNumber') { return !v['uniqueId']; }                       // auto-filled from uniqueId
      if (f === 'idExpiryDate') { return !(v['idExpiryDate'] || v['acceptExpired']); }
      return !v[f];
    });
  }

  /** Field labels for the "still missing" hint — same generated source as the rules. */
  missingFieldLabels(): string {
    return this.missingCanonicalFields().map(f => EKYC_FIELD_LABELS[f] ?? f).join(', ');
  }

  private isModeBValid(): boolean {
    const v = this.form.value;
    // The name requirement is the PAIR RULE, which no table can express — the server
    // derives the missing form, so either shape is acceptable here too.
    const nameOk = !!(v.nameFull || (v.nameFirst && v.nameLast));
    return !!(v.service && v.provider && v.providerTrxRefNo && v.idType && v.uniqueId
      && nameOk && this.missingCanonicalFields().length === 0
      && v.email && v.mobile && v.didType && v.countryCode && Number(v.level) >= 2);
  }

  canSubmit(): boolean {
    return this.mode() === 'A' ? this.isModeAValid() : this.isModeBValid();
  }

  async onSubmit() {
    if (!this.canSubmit()) return;
    const v = this.form.value;
    const body: Record<string, any> = { service: v.service };
    if (this.mode() === 'A') {
      body['didHash'] = v.didHash;
    } else {
      // Canonical identity data (v3) — the operator maps the SP's result into these fields;
      // the API whitelists them and nulls whatever is missing. idNumber = the document
      // number for the chosen idType (the server aliases nationalId for idType 1).
      const canonical: Record<string, any> = {
        idNumber: String(v.uniqueId).trim(),
        ...(v.nameFull ? { nameFull: String(v.nameFull).trim() } : {}),
      };
      for (const field of CANONICAL_EXTRA_FIELDS) {
        const value = (v as Record<string, any>)[field];
        if (value) canonical[field] = String(value).trim();
      }

      body['email'] = v.email;
      body['mobile'] = v.mobile;
      body['didType'] = Number(v.didType);
      body['countryCode'] = Number(v.countryCode);
      body['level'] = Number(v.level);
      body['idType'] = Number(v.idType) || 1;
      body['uniqueId'] = String(v.uniqueId).trim();
      body['ekyc'] = {
        provider: v.provider,
        ...(v.providerName ? { providerName: String(v.providerName).trim() } : {}),
        providerTrxRefNo: String(v.providerTrxRefNo).trim(),
        ...(v.providerTrxTime
          ? { providerTrxTime: Math.floor(new Date(v.providerTrxTime as string).getTime() / 1000) }
          : {}),
        canonical,
        ...(v.acceptExpired ? { acceptExpiredDocument: true } : {}),
      };
    }

    this.loadingService.show(this.translate.instant('subscriptions.addModal.creating'));
    const res = await this.apiService.usersOnboard(body, this.mode() === 'A' ? 'did' : 'new');
    this.loadingService.hide();

    if (res.error || !res.subscriptionAddress) {
      await this.alertService.info(this.translate.instant('alerts.error'), res.error || this.translate.instant('subscriptions.addModal.errorFailed'));
      return;
    }
    this.modalService.confirm(res.subscriptionAddress);
  }

  onCancel() {
    this.modalService.cancel();
  }
}
