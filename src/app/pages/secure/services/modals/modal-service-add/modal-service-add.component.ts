import { Component, ChangeDetectionStrategy, inject, signal, effect, computed } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalServiceAddService, AddServiceData, SELF_CUSTODY_SENTINEL } from './modal-service-add.service';
import { ApiService } from '../../../../../shared/services/api.service';

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
  providerTypes = signal<{ variableId: number; name: string }[]>([]);
  verificationLevels = signal<{ variableId: number; name: string }[]>([]);
  regulators = signal<{ address: string; name: string; symbol: string }[]>([]);
  allValidators = signal<{ address: string; name: string; validationLevel: number; state: number }[]>([]);
  paymentProcessors = signal<{ address: string; name: string; serviceLevel: number; state: number }[]>([]);
  custodians = signal<{ address: string; name: string; state: number }[]>([]);
  readonly SELF_CUSTODY = SELF_CUSTODY_SENTINEL;
  selectedVerificationLevel = signal<number>(0);
  selectedServiceType = signal<number>(0);

  currentStep = signal<number>(1);
  totalSteps = computed(() => this.isTokenIssuer() ? 5 : 4);
  stepLabels = computed(() => this.isTokenIssuer()
    ? ['Configuration', 'Identity', 'Contact', 'Linked Services', 'Review & Confirm']
    : ['Configuration', 'Identity', 'Contact', 'Review & Confirm']
  );
  reviewConfirmed = signal(false);

  validators = computed(() => {
    const level = this.selectedVerificationLevel();
    return this.allValidators().filter(v => !level || v.validationLevel >= level);
  });

  isTokenIssuer = computed(() => this.selectedServiceType() === 1);
  // serviceType 2 = Service Provider. The entity DECLARES its sub-type (providerType) here;
  // the regulator confirms it later, after which it appears under that regulator's
  // validators / payment processors / custodians / data providers list.
  isServiceProvider = computed(() => this.selectedServiceType() === 2);

  addForm = this.fb.group({
    serviceType: ['', Validators.required],
    providerType: [''],
    name: ['', Validators.required],
    description: ['', Validators.required],
    website: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+\..+/)]],
    email: ['', [Validators.required, Validators.email]],
    mobile: ['', [Validators.required, Validators.pattern(/^\+?[0-9\s\-()]{7,20}$/)]],
    verificationLevel: ['', Validators.required],
    regulator: ['', Validators.required],
    validator: [''],
    paymentProcessor: [''],
    custodian: [SELF_CUSTODY_SENTINEL],
    visibility: [1, Validators.required],
  });

  constructor() {
    effect(() => {
      if (this.addServiceService.isVisible()) {
        this.currentStep.set(1);
        this.reviewConfirmed.set(false);
        this.addForm.reset({
          serviceType: '', providerType: '', name: '', description: '', website: '',
          email: '', mobile: '', verificationLevel: '', regulator: '',
          validator: '', paymentProcessor: '', custodian: SELF_CUSTODY_SENTINEL, visibility: 1,
        });
        this.loadServiceTypes();
        this.loadProviderTypes();
        this.loadVerificationLevels();
        this.loadRegulators();
        this.loadValidators();
        this.loadPaymentProcessors();
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
      const providerType = this.addForm.get('providerType')!;
      if (Number(val) !== 1) {
        this.addForm.get('validator')!.setValue('');
        this.addForm.get('paymentProcessor')!.setValue('');
        this.addForm.get('custodian')!.setValue('');
        // Verification level only applies to token-issuer services — drop the requirement for others.
        verificationLevel.setValue('');
        verificationLevel.clearValidators();
        verificationLevel.updateValueAndValidity();
      } else {
        verificationLevel.setValidators(Validators.required);
        verificationLevel.updateValueAndValidity();
        // Default type-1 services to self-custody and refresh endorsed custodian list.
        if (!this.addForm.get('custodian')!.value) {
          this.addForm.get('custodian')!.setValue(SELF_CUSTODY_SENTINEL);
        }
      }
      // providerType is required ONLY for service providers (serviceType 2).
      if (Number(val) === 2) {
        providerType.setValidators(Validators.required);
      } else {
        providerType.setValue('');
        providerType.clearValidators();
      }
      providerType.updateValueAndValidity();
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

  async loadProviderTypes() {
    const data = await this.apiService.vaultGetGlobalVariables();
    if (data) {
      this.providerTypes.set(
        data
          .filter((item: any) => item.category === 'Regulator Party Type')
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
  // (1=Validator, 2=PaymentProcessor, 3=Custodian). Service creation may only pick from
  // this admin-curated subset — enforced on-chain too.
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

  async loadPaymentProcessors() {
    const [data, curated] = await Promise.all([this.apiService.vaultGetPaymentProcessors(1, 50), this.curatedAddresses(2)]);
    if (data?.paymentProcessors) {
      this.paymentProcessors.set(data.paymentProcessors.filter((s: any) => s.state === 2 && curated.has(s.address.toLowerCase())));
    }
  }

  async loadCustodians(regulator: string) {
    if (!regulator) { this.custodians.set([]); return; }
    const [data, curated] = await Promise.all([this.apiService.vaultGetEndorsedCustodians(regulator, 1, 50), this.curatedAddresses(3)]);
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
      if (this.isTokenIssuer()) return ['serviceType', 'verificationLevel', 'regulator'];
      if (this.isServiceProvider()) return ['serviceType', 'providerType', 'regulator'];
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

  getProviderTypeName(): string {
    return this.providerTypes().find(p => p.variableId === Number(this.addForm.get('providerType')?.value))?.name ?? '';
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

  getPaymentProcessorName(): string {
    const p = this.paymentProcessors().find(p => p.address === this.addForm.get('paymentProcessor')?.value);
    return p ? (p.name || p.address) : 'None';
  }

  async fillFromEntity(): Promise<void> {
    const info = await this.apiService.vaultGetEntityInfo();
    if (!info) return;
    const meta = typeof (info as any).metadata === 'string' ? JSON.parse((info as any).metadata) : (info as any).metadata ?? {};
    this.addForm.patchValue({
      website: meta.website ?? '',
      email: meta.email ?? '',
      mobile: meta.mobile ?? '',
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
      // providerType is the entity's declared sub-type — only meaningful for service providers (type 2).
      providerType: Number(formValue.serviceType) === 2 ? Number(formValue.providerType) : 0,
      regulator: formValue.regulator ?? '',
      validator: formValue.validator ?? '',
      paymentProcessor: formValue.paymentProcessor ?? '',
      // Custodian is only meaningful for type-1 services. Non-type-1 send empty (treated as unset by the API).
      custodian: Number(formValue.serviceType) === 1 ? (formValue.custodian || SELF_CUSTODY_SENTINEL) : '',
      visibility: Number(formValue.visibility) || 1,
    };
    this.addServiceService.confirm(data);
  }

  onCancel(): void {
    this.addServiceService.cancel();
  }
}
