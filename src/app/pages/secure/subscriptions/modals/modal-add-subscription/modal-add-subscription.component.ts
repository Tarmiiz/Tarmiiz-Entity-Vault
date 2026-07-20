import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ModalAddSubscriptionService } from './modal-add-subscription.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';

// The optional canonical identity-data fields (beyond the required nationalId + nameFull) —
// mirror of the Entity API's ekycCanonical.IDENTITY_FIELDS (unknown keys are dropped there).
const CANONICAL_EXTRA_FIELDS = [
  'nameFirst', 'nameLast', 'gender', 'dateOfBirth', 'maritalStatus', 'religion',
  'profession', 'husbandName', 'nationalIdSerial', 'idReleaseDate', 'idExpiryDate',
  'addressStreet', 'addressDistrict', 'addressGovernorate', 'birthGovernorate',
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
    uniqueId: [''],
    email: [''],
    mobile: [''],
    didType: [1 as number | null],
    countryCode: [null as number | null],
    level: [2 as number | null],
    // Mode B — canonical identity data (nationalId is auto-filled from uniqueId)
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
      uniqueId: '',
      email: '',
      mobile: '',
      didType: 1,
      countryCode: null,
      level: 2,
      nameFull: '',
      nameFirst: '', nameLast: '', gender: '', dateOfBirth: '', maritalStatus: '',
      religion: '', profession: '', husbandName: '', nationalIdSerial: '',
      idReleaseDate: '', idExpiryDate: '', addressStreet: '', addressDistrict: '',
      addressGovernorate: '', birthGovernorate: '',
    });
  }

  async loadServices() {
    const data = await this.apiService.vaultGetServicesOwn(0, 200);
    if (data?.services) {
      this.services.set(
        data.services
          .filter((s: any) => Number(s.service_type) === 1 && Number(s.state) === 2)
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

  private isModeBValid(): boolean {
    const v = this.form.value;
    return !!(v.service && v.provider && v.providerTrxRefNo && v.uniqueId && v.nameFull
      && v.email && v.mobile && v.didType && v.countryCode && v.level);
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
      // Canonical identity data — the operator maps the SP's result into these fields;
      // the API whitelists them and nulls whatever is missing.
      const canonical: Record<string, any> = {
        nationalId: String(v.uniqueId).trim(),
        nameFull:   String(v.nameFull).trim(),
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
      body['uniqueId'] = String(v.uniqueId).trim();
      body['ekyc'] = {
        provider: v.provider,
        ...(v.providerName ? { providerName: String(v.providerName).trim() } : {}),
        providerTrxRefNo: String(v.providerTrxRefNo).trim(),
        ...(v.providerTrxTime
          ? { providerTrxTime: Math.floor(new Date(v.providerTrxTime as string).getTime() / 1000) }
          : {}),
        canonical,
      };
    }

    this.loadingService.show(this.translate.instant('subscriptions.addModal.creating'));
    const res = await this.apiService.usersOnboard(body, this.mode() === 'A' ? 'did' : 'new');
    this.loadingService.hide();

    if (res.error || !res.subscriptionAddress) {
      await this.alertService.show(this.translate.instant('alerts.error'), res.error || this.translate.instant('subscriptions.addModal.errorFailed'));
      return;
    }
    this.modalService.confirm(res.subscriptionAddress);
  }

  onCancel() {
    this.modalService.cancel();
  }
}
