import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalAssetAddService, AddAssetData } from './modal-asset-add.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { UtilsService } from '../../../../../shared/services/utils.service';

@Component({
  selector: 'app-modal-asset-add',
  templateUrl: './modal-asset-add.component.html',
  styleUrls: ['./modal-asset-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalAssetAddComponent {

  addAssetService = inject(ModalAssetAddService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);
  utils = inject(UtilsService);

  // Reference data
  services = signal<{ address: string; name: string; paymentProcessor: string | null }[]>([]);
  countries = signal<{ countryCode: number; nameShort: string; currencyCode: string }[]>([]);
  regulators = signal<{ address: string; name: string; symbol: string }[]>([]);
  tokenTypes = signal<{ id: number; name: string }[]>([]);
  assetTypes = signal<{ id: number; name: string }[]>([]);

  // Address resolution
  knownAddresses = signal<{ address: string; name: string }[]>([]);
  ownerName = signal('');
  issuerName = signal('');
  managerName = signal('');

  // Wizard state
  currentStep = signal(1);
  readonly totalSteps = 5;
  readonly stepLabels = ['Token Type', 'Identity', 'Service', 'Roles', 'Review'];
  reviewConfirmed = signal(false);

  // Symbol availability check (on-chain via API)
  symbolAvailable = signal<boolean | null>(null);
  symbolCheckPending = signal(false);

  addForm = this.fb.group({
    owner: ['', Validators.required],
    issuer: ['', Validators.required],
    manager: ['', Validators.required],
    name: ['', Validators.required],
    symbol: ['', Validators.required],
    tokenType: ['', Validators.required],
    assetType: [''],
    initialSupply: [''],
    description: ['', Validators.required],
    service: ['', Validators.required],
    currency: ['', Validators.required],
    regulator: ['', Validators.required],
    creditSettlement: [false],
  });

  get isFixedSupply(): boolean {
    return this.addForm.get('tokenType')?.value === '1';
  }

  get selectedServiceHasPaymentProcessor(): boolean {
    const serviceAddr = this.addForm.get('service')?.value;
    if (!serviceAddr) return false;
    const svc = this.services().find(s => s.address === serviceAddr);
    return !!svc?.paymentProcessor;
  }

  constructor() {
    // Reset and load data each time the modal opens
    effect(() => {
      if (this.addAssetService.isVisible()) {
        this.addForm.reset({ creditSettlement: false });
        this.currentStep.set(1);
        this.symbolAvailable.set(null);
        this.symbolCheckPending.set(false);
        this.reviewConfirmed.set(false);
        this.ownerName.set('');
        this.issuerName.set('');
        this.managerName.set('');
        this.loadServices();
        this.loadCountriesAndRegulators();
        this.loadTokenAndAssetTypes();
        this.loadKnownAddresses();
      }
    });

    // Auto-uncheck credit settlement when service changes to one without payment processor
    this.addForm.get('service')!.valueChanges.subscribe(() => {
      if (!this.selectedServiceHasPaymentProcessor) {
        this.addForm.get('creditSettlement')!.setValue(false);
      }
    });

    // Conditional validators for BasicToken
    this.addForm.get('tokenType')!.valueChanges.subscribe(val => {
      const assetTypeCtrl = this.addForm.get('assetType')!;
      const initialSupplyCtrl = this.addForm.get('initialSupply')!;
      if (val === '1') {
        assetTypeCtrl.setValidators(Validators.required);
        initialSupplyCtrl.setValidators([Validators.required, Validators.min(0)]);
      } else {
        assetTypeCtrl.clearValidators();
        initialSupplyCtrl.clearValidators();
        assetTypeCtrl.setValue('');
        initialSupplyCtrl.setValue('');
      }
      assetTypeCtrl.updateValueAndValidity();
      initialSupplyCtrl.updateValueAndValidity();
    });
  }

  // --- Step navigation ---

  private readonly stepFields: Record<number, string[]> = {
    1: ['tokenType'],
    2: ['name', 'symbol', 'description'],
    3: ['service', 'currency'],
    4: ['owner', 'issuer', 'manager', 'regulator'],
  };

  isCurrentStepValid(): boolean {
    const step = this.currentStep();
    if (step === 5) return this.addForm.valid;
    let fields = this.stepFields[step] ?? [];
    if (step === 1 && this.isFixedSupply) {
      fields = [...fields, 'assetType', 'initialSupply'];
    }
    return fields.every(f => this.addForm.get(f)?.valid ?? true);
  }

  nextStep(): void {
    if (!this.isCurrentStepValid() || this.currentStep() >= this.totalSteps) return;
    if (this.currentStep() === 2) {
      this.symbolCheckPending.set(true);
    }
    if (this.currentStep() === 3 && this.symbolCheckPending()) {
      this.checkSymbolAvailability();
    }
    this.currentStep.update(s => s + 1);
  }

  prevStep(): void {
    if (this.currentStep() > 1) {
      this.currentStep.update(s => s - 1);
    }
  }

  // --- Symbol availability check (on-chain) ---

  async checkSymbolAvailability() {
    const symbol = (this.addForm.get('symbol')?.value ?? '').trim();
    const currencyCode = Number(this.addForm.get('currency')?.value);
    if (!symbol || !currencyCode) return;
    this.symbolCheckPending.set(false);
    const exists = await this.apiService.vaultCheckSymbol(currencyCode, symbol);
    if (exists !== null) {
      this.symbolAvailable.set(!exists);
    }
  }

  onSymbolChange(): void {
    this.symbolAvailable.set(null);
    this.symbolCheckPending.set(true);
  }

  // --- Address resolution ---

  async loadKnownAddresses() {
    const entries: { address: string; name: string }[] = [];

    const entity = await this.apiService.vaultGetEntityInfo();
    if (entity?.address) {
      entries.push({ address: entity.address.toLowerCase(), name: entity.name || 'Entity' });
    }

    this.knownAddresses.set(entries);
  }

  resolveAddress(field: 'owner' | 'issuer' | 'manager'): void {
    const address = (this.addForm.get(field)?.value ?? '').toLowerCase().trim();
    const match = address ? this.knownAddresses().find(k => k.address === address) : null;
    const name = match?.name ?? '';
    if (field === 'owner') this.ownerName.set(name);
    else if (field === 'issuer') this.issuerName.set(name);
    else this.managerName.set(name);
  }

  // --- Display name resolvers ---

  getTokenTypeName(): string {
    return this.tokenTypes().find(t => t.id === Number(this.addForm.get('tokenType')?.value))?.name ?? '';
  }

  getAssetTypeName(): string {
    return this.assetTypes().find(t => t.id === Number(this.addForm.get('assetType')?.value))?.name ?? '';
  }

  getServiceName(): string {
    return this.services().find(s => s.address === this.addForm.get('service')?.value)?.name ?? '';
  }

  getCurrencyDisplay(): string {
    const c = this.countries().find(c => c.countryCode === Number(this.addForm.get('currency')?.value));
    return c ? `${c.nameShort} (${c.currencyCode})` : '';
  }

  getRegulatorDisplay(): string {
    const r = this.regulators().find(r => r.address === this.addForm.get('regulator')?.value);
    return r ? `${r.name} (${r.symbol})` : '';
  }

  // --- Data loading ---

  async loadServices() {
    const data = await this.apiService.vaultGetServicesOwn(0, 50);
    if (data?.services) {
      this.services.set(
        data.services
          .filter((s: any) => s.service_type === 1)
          .map((s: any) => ({
            address: s.address,
            name: s.name,
            paymentProcessor: s.payment_processor ?? null,
          }))
      );
    }
  }

  async loadCountriesAndRegulators() {
    const [countries, entity] = await Promise.all([
      this.apiService.vaultGetCountries(),
      this.apiService.vaultGetEntityInfo(),
    ]);
    if (countries) {
      this.countries.set(countries.map((c: any) => ({
        countryCode: c.country_code,
        nameShort: c.name_short,
        currencyCode: c.currency_code,
      })));
    }
    if (entity) {
      const regulators = await this.apiService.vaultGetRegulatorsByCountry(String(entity.country_code), 0, 100);
      if (regulators) {
        this.regulators.set(regulators.filter((r: any) => r.state).map((r: any) => ({
          address: r.address,
          name: r.name,
          symbol: r.symbol,
        })));
      }
    }
  }

  async loadTokenAndAssetTypes() {
    const [tokenTypesRaw, assetTypesRaw] = await Promise.all([
      this.apiService.vaultGetGlobalVariablesByCategory('Asset Token Type'),
      this.apiService.vaultGetGlobalVariablesByCategory('Asset Type'),
    ]);
    if (tokenTypesRaw) {
      this.tokenTypes.set(tokenTypesRaw.map((v: any) => ({ id: v.variable_id, name: v.name })));
    }
    if (assetTypesRaw) {
      this.assetTypes.set(assetTypesRaw.map((v: any) => ({ id: v.variable_id, name: v.name })));
    }
  }

  // --- Form submission ---

  onSave(): void {
    if (this.addForm.invalid) return;

    const formValue = this.addForm.getRawValue();
    const tokenType = Number(formValue.tokenType);
    const data: AddAssetData = {
      owner: formValue.owner ?? '',
      issuer: formValue.issuer ?? '',
      manager: formValue.manager ?? '',
      name: formValue.name ?? '',
      symbol: formValue.symbol ?? '',
      description: formValue.description ?? '',
      service: formValue.service ?? '',
      currency: Number(formValue.currency),
      regulator: formValue.regulator ?? '',
      tokenType,
      creditSettlement: formValue.creditSettlement === true,
      ...(tokenType === 1 ? {
        assetType: Number(formValue.assetType),
        initialSupply: Number(formValue.initialSupply),
      } : {}),
    };
    this.addAssetService.confirm(data);
  }

  onCancel(): void {
    this.addAssetService.cancel();
  }
}
