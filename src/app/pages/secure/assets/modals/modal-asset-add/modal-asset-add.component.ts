import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, FormControl, Validators } from '@angular/forms';

import { ModalAssetAddService, AddAssetData } from './modal-asset-add.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { UtilsService } from '../../../../../shared/services/utils.service';

@Component({
  selector: 'app-modal-asset-add',
  templateUrl: './modal-asset-add.component.html',
  styleUrls: ['./modal-asset-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
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
  // Supply modes — the 1 = Fixed / 2 = Dynamic choice that used to be `tokenType` on the
  // two leaf templates. The on-chain T20Template carries it as immutable `_supplyMode`.
  // The Global Variables registry still exposes these under the 'Asset Token Type' category
  // for backward compat; the API translates between the two names.
  supplyModes = signal<{ id: number; name: string }[]>([]);
  assetTypes = signal<{ id: number; name: string }[]>([]);
  priceModes = signal<{ id: number; name: string }[]>([
    { id: 1, name: 'Single' },
    { id: 2, name: 'Bid/Ask' },
  ]);

  // Address resolution
  knownAddresses = signal<{ address: string; name: string }[]>([]);
  entityAddress = signal('');
  ownerName = signal('');
  issuerName = signal('');
  managerName = signal('');

  // Wizard state
  currentStep = signal(1);
  readonly totalSteps = 6;
  readonly stepLabels = ['Supply Mode', 'Identity', 'Metadata', 'Service', 'Roles', 'Review'];
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
    // supplyMode: 1 = Fixed (initialSupply minted to contract at init), 2 = Dynamic (mint on subscribe).
    // Replaces the old leaf-template-encoded `tokenType` choice.
    supplyMode: ['', Validators.required],
    priceMode: ['2', Validators.required],
    assetType: [''],
    initialSupply: [''],
    description: ['', Validators.required],
    service: ['', Validators.required],
    currency: ['', Validators.required],
    regulator: ['', Validators.required],
    creditSettlement: [false],
    metadata: this.fb.array<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>>([]),
  });

  metadataError = signal('');

  get metadataRows(): FormArray<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>> {
    return this.addForm.get('metadata') as FormArray<FormGroup<{ key: FormControl<string>; value: FormControl<string> }>>;
  }

  addMetadataRow(): void {
    this.metadataRows.push(this.fb.nonNullable.group({
      key: '',
      value: '',
    }));
  }

  removeMetadataRow(index: number): void {
    this.metadataRows.removeAt(index);
    if (this.metadataRows.length === 0) {
      this.addMetadataRow();
    }
  }

  /**
   * Returns '' if metadata is valid, else a user-facing error string.
   * Empty-key rows are ignored (will be dropped on submit).
   */
  private validateMetadata(): string {
    const seen = new Set<string>();
    for (const ctrl of this.metadataRows.controls) {
      const key = (ctrl.controls.key.value ?? '').trim();
      if (!key) continue;
      if (key.toLowerCase() === 'description') {
        return '"description" is reserved — use the Description field above.';
      }
      if (seen.has(key)) {
        return `Duplicate key: "${key}".`;
      }
      seen.add(key);
    }
    return '';
  }

  get isFixedSupply(): boolean {
    return this.addForm.get('supplyMode')?.value === '1';
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
        this.metadataRows.clear();
        this.addMetadataRow();
        this.metadataError.set('');
        this.currentStep.set(1);
        this.symbolAvailable.set(null);
        this.symbolCheckPending.set(false);
        this.reviewConfirmed.set(false);
        this.ownerName.set('');
        this.issuerName.set('');
        this.managerName.set('');
        this.loadServices();
        this.loadCountriesAndRegulators();
        this.loadSupplyModesAndAssetTypes();
        this.loadKnownAddresses();
      }
    });

    this.metadataRows.valueChanges.subscribe(() => {
      this.metadataError.set(this.validateMetadata());
    });

    // Auto-uncheck credit settlement when service changes to one without payment processor
    this.addForm.get('service')!.valueChanges.subscribe(() => {
      if (!this.selectedServiceHasPaymentProcessor) {
        this.addForm.get('creditSettlement')!.setValue(false);
      }
    });

    // Conditional validators driven by supplyMode (Fixed vs Dynamic).
    this.addForm.get('supplyMode')!.valueChanges.subscribe(val => {
      const assetTypeCtrl = this.addForm.get('assetType')!;
      const initialSupplyCtrl = this.addForm.get('initialSupply')!;
      const priceModeCtrl = this.addForm.get('priceMode')!;
      if (val === '1') {
        // Fixed supply — initialSupply minted to contract at init.
        assetTypeCtrl.setValidators(Validators.required);
        initialSupplyCtrl.setValidators([Validators.required, Validators.min(0)]);
        // Fixed supply defaults to BidAsk
        priceModeCtrl.setValue('2');
      } else {
        // Dynamic supply — totalSupply starts at 0, mint on subscribe.
        assetTypeCtrl.clearValidators();
        initialSupplyCtrl.clearValidators();
        assetTypeCtrl.setValue('');
        initialSupplyCtrl.setValue('');
        // Dynamic supply defaults to Single (NAV-style)
        if (val === '2') priceModeCtrl.setValue('1');
      }
      assetTypeCtrl.updateValueAndValidity();
      initialSupplyCtrl.updateValueAndValidity();
    });
  }

  // --- Step navigation ---

  private readonly stepFields: Record<number, string[]> = {
    1: ['supplyMode', 'priceMode'],
    2: ['name', 'symbol', 'description'],
    3: [],
    4: ['service', 'currency'],
    5: ['owner', 'issuer', 'manager', 'regulator'],
  };

  isCurrentStepValid(): boolean {
    const step = this.currentStep();
    if (step === 6) return this.addForm.valid && !this.metadataError();
    let fields = this.stepFields[step] ?? [];
    if (step === 1 && this.isFixedSupply) {
      fields = [...fields, 'assetType', 'initialSupply'];
    }
    const fieldsValid = fields.every(f => this.addForm.get(f)?.valid ?? true);
    if (step === 3 && this.metadataError()) return false;
    return fieldsValid;
  }

  nextStep(): void {
    if (!this.isCurrentStepValid() || this.currentStep() >= this.totalSteps) return;
    if (this.currentStep() === 2) {
      this.symbolCheckPending.set(true);
    }
    if (this.currentStep() === 4 && this.symbolCheckPending()) {
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
      this.entityAddress.set(entity.address);
      entries.push({ address: entity.address.toLowerCase(), name: entity.name || 'Entity' });
    }

    this.knownAddresses.set(entries);
  }

  useSelf(field: 'owner' | 'issuer' | 'manager'): void {
    const addr = this.entityAddress();
    if (!addr) return;
    this.addForm.get(field)?.setValue(addr);
    this.resolveAddress(field);
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

  getSupplyModeName(): string {
    return this.supplyModes().find(t => t.id === Number(this.addForm.get('supplyMode')?.value))?.name ?? '';
  }

  getAssetTypeName(): string {
    return this.assetTypes().find(t => t.id === Number(this.addForm.get('assetType')?.value))?.name ?? '';
  }

  getPriceModeName(): string {
    return this.priceModes().find(p => p.id === Number(this.addForm.get('priceMode')?.value))?.name ?? '';
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

  async loadSupplyModesAndAssetTypes() {
    // The Global Variables registry still exposes the 1=Fixed/2=Dynamic choice under the
    // 'Asset Token Type' category for backward compat — the modal renders it as 'Supply Mode'.
    const [supplyModesRaw, assetTypesRaw] = await Promise.all([
      this.apiService.vaultGetGlobalVariablesByCategory('Asset Token Type'),
      this.apiService.vaultGetGlobalVariablesByCategory('Asset Type'),
    ]);
    if (supplyModesRaw) {
      this.supplyModes.set(supplyModesRaw.map((v: any) => ({ id: v.variable_id, name: v.name })));
    }
    if (assetTypesRaw) {
      this.assetTypes.set(assetTypesRaw.map((v: any) => ({ id: v.variable_id, name: v.name })));
    }
  }

  // --- Form submission ---

  onSave(): void {
    if (this.addForm.invalid) return;
    const metadataErr = this.validateMetadata();
    if (metadataErr) {
      this.metadataError.set(metadataErr);
      return;
    }

    const customMetadata: Record<string, string> = {};
    for (const ctrl of this.metadataRows.controls) {
      const key = (ctrl.controls.key.value ?? '').trim();
      if (!key) continue;
      customMetadata[key] = (ctrl.controls.value.value ?? '').trim();
    }

    const formValue = this.addForm.getRawValue();
    const supplyMode = Number(formValue.supplyMode);
    const priceMode = Number(formValue.priceMode) || 2;
    // tokenType: V1 only supports 1 (T20). T3643 follow-up adds 2.
    const tokenType = 1;
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
      supplyMode,
      priceMode,
      creditSettlement: formValue.creditSettlement === true,
      customMetadata,
      ...(supplyMode === 1 ? {
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
