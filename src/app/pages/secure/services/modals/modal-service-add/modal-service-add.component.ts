import { Component, ChangeDetectionStrategy, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalServiceAddService, AddServiceData } from './modal-service-add.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-service-add',
  templateUrl: './modal-service-add.component.html',
  styleUrls: ['./modal-service-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalServiceAddComponent {

  addServiceService = inject(ModalServiceAddService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  serviceTypes = signal<{ variableId: number; name: string }[]>([]);
  verificationLevels = signal<{ variableId: number; name: string }[]>([]);
  regulators = signal<{ address: string; name: string; symbol: string }[]>([]);
  allValidators = signal<{ address: string; name: string; validationLevel: number; state: number }[]>([]);
  paymentProcessors = signal<{ address: string; name: string; serviceLevel: number; state: number }[]>([]);
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

  addForm = this.fb.group({
    serviceType: ['', Validators.required],
    name: ['', Validators.required],
    description: ['', Validators.required],
    website: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+\..+/)]],
    email: ['', [Validators.required, Validators.email]],
    mobile: ['', [Validators.required, Validators.pattern(/^\+?[0-9\s\-()]{7,20}$/)]],
    verificationLevel: ['', Validators.required],
    regulator: ['', Validators.required],
    validator: [''],
    paymentProcessor: [''],
  });

  constructor() {
    effect(() => {
      if (this.addServiceService.isVisible()) {
        this.currentStep.set(1);
        this.reviewConfirmed.set(false);
        this.addForm.reset({
          serviceType: '', name: '', description: '', website: '',
          email: '', mobile: '', verificationLevel: '', regulator: '',
          validator: '', paymentProcessor: '',
        });
        this.loadServiceTypes();
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
      if (Number(val) !== 1) {
        this.addForm.get('validator')!.setValue('');
        this.addForm.get('paymentProcessor')!.setValue('');
      }
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

  async loadValidators() {
    const data = await this.apiService.vaultGetValidators(1, 50);
    if (data?.validators) {
      this.allValidators.set(data.validators.filter((v: any) => v.state === 2));
    }
  }

  async loadPaymentProcessors() {
    const data = await this.apiService.vaultGetPaymentProcessors(1, 50);
    if (data?.paymentProcessors) {
      this.paymentProcessors.set(data.paymentProcessors.filter((s: any) => s.state === 2));
    }
  }

  private stepFields(): string[] {
    const step = this.currentStep();
    if (step === 1) return ['serviceType', 'verificationLevel', 'regulator'];
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
      regulator: formValue.regulator ?? '',
      validator: formValue.validator ?? '',
      paymentProcessor: formValue.paymentProcessor ?? '',
    };
    this.addServiceService.confirm(data);
  }

  onCancel(): void {
    this.addServiceService.cancel();
  }
}
