import { Component, ChangeDetectionStrategy, inject, signal, effect, untracked } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, FormControl, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalAssetAddService, AddAssetData, WizardDocFile, WizardImageFile } from './modal-asset-add.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { ISIN_TYPE_NAME, normalizeIdentifierValue, validateIdentifierValue } from '../../../../../shared/utils/identifier.utils';

@Component({
  selector: 'app-modal-asset-add',
  templateUrl: './modal-asset-add.component.html',
  styleUrls: ['./modal-asset-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalAssetAddComponent {

  addAssetService = inject(ModalAssetAddService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);
  utils = inject(UtilsService);
  features = inject(FeaturesService);

  // Reference data
  services = signal<{ address: string; name: string; paymentProcessor: string | null }[]>([]);
  countries = signal<{ countryCode: number; nameShort: string; currencyCode: string; currencyName: string }[]>([]);
  regulators = signal<{ address: string; name: string; symbol: string }[]>([]);
  // Supply modes — the 1 = Fixed / 2 = Dynamic choice that the on-chain T20Template carries
  // as immutable `_supplyMode`. Sourced from the 'Asset Supply Mode' global category
  // (distinct from 'Asset Token Type', which is the T20/T3643 standard).
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

  // Standards — BYO model exposes both T20 (Fund / RWA) and T3643 (Security Token).
  // tokenType is set at deploy time and immutable thereafter (the asset's `getStandard()`
  // returns "T20" or "T3643"; the factory chooses which impl to wrap in ERC1967Proxy).
  readonly tokenTypes: { id: number; name: string; subtitle: string }[] = [
    { id: 1, name: 'Tarmiiz T20',   subtitle: 'Fund / Real-World Asset' },
    { id: 2, name: 'Tarmiiz T3643', subtitle: 'Security Token (ERC-3643)' },
  ];

  // Wizard state
  currentStep = signal(1);
  readonly totalSteps = 8;
  readonly stepLabels = ['Standard & Supply', 'Identity', 'Metadata', 'Service', 'Roles', 'Documents', 'Images', 'Review'];
  readonly stepNumbers = [1, 2, 3, 4, 5, 6, 7, 8];
  reviewConfirmed = signal(false);

  // Optional attachments (steps 6 + 7) — collected here, uploaded by the list page
  // AFTER the asset is created (docs attach to the new asset's address).
  docFiles = signal<WizardDocFile[]>([]);
  imageFiles = signal<WizardImageFile[]>([]);

  // Symbol availability check (on-chain via API)
  symbolAvailable = signal<boolean | null>(null);
  symbolCheckPending = signal(false);

  addForm = this.fb.group({
    owner: ['', Validators.required],
    issuer: ['', Validators.required],
    manager: ['', Validators.required],
    name: ['', Validators.required],
    symbol: ['', Validators.required],
    // tokenType: 1 = TarmiizT20, 2 = TarmiizT3643 (ERC-3643 security token). Default T20.
    tokenType: ['1', Validators.required],
    // supplyMode: 1 = Fixed (initialSupply minted to contract at init), 2 = Dynamic (mint on subscribe).
    // Replaces the old leaf-template-encoded `tokenType` choice.
    supplyMode: ['', Validators.required],
    priceMode: ['2', Validators.required],
    // Asset Type (real-world category) applies to ALL assets regardless of supply mode.
    assetType: ['', Validators.required],
    initialSupply: [''],
    description: ['', Validators.required],
    service: ['', Validators.required],
    currency: ['', Validators.required],
    regulator: ['', Validators.required],
    // Inverted UI control: checked = opt OUT of credit settlement. Credit settlement is the default (unchecked).
    noCreditSettlement: [false],
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
      if (key.toLowerCase() === 'media') {
        return '"media" is reserved — attach documents and images in the wizard steps instead.';
      }
      if (key.toLowerCase() === 'contact') {
        return '"contact" is reserved — set contact info from the asset details page after creation.';
      }
      // Both are reserved by the Identifiers field on this step. `isin` is called out by name
      // because it is what people typed before that field existed — this hint used to suggest it.
      if (key.toLowerCase() === 'identifiers' || key.toLowerCase() === 'isin') {
        return '"identifiers" and "isin" are reserved — use the ISIN field on this step, or the asset details page later.';
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
        this.addForm.reset({ noCreditSettlement: false });
        // When the T3643 standard picker is disabled by admin, the step-1 selector is hidden
        // and every new asset is a plain T20 — seed the (otherwise required) control so step 1
        // validates without user input.
        if (!this.features.menuEnabled('asset-t3643')) {
          this.addForm.get('tokenType')!.setValue('1');
        }
        this.metadataRows.clear();
        this.addMetadataRow();
        this.metadataError.set('');
        // untracked: resetAttachments reads + writes the attachment signals — tracked here,
        // that read would register them as effect deps and the writes would re-trigger the
        // effect forever (fresh [] reference each run), hanging the UI on modal open.
        untracked(() => this.resetAttachments());
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

    // Force "opt out" when service changes to one without payment processor
    // (credit settlement is impossible without a payment processor).
    this.addForm.get('service')!.valueChanges.subscribe(() => {
      if (!this.selectedServiceHasPaymentProcessor) {
        this.addForm.get('noCreditSettlement')!.setValue(true);
      }
    });

    // Conditional validators driven by supplyMode (Fixed vs Dynamic).
    // Note: assetType is required for ALL supply modes (it's the real-world category),
    // so it is NOT touched here — only initialSupply + the priceMode default are.
    this.addForm.get('supplyMode')!.valueChanges.subscribe(val => {
      const initialSupplyCtrl = this.addForm.get('initialSupply')!;
      const priceModeCtrl = this.addForm.get('priceMode')!;
      if (val === '1') {
        // Fixed supply — initialSupply minted to contract at init.
        initialSupplyCtrl.setValidators([Validators.required, Validators.min(0)]);
        // Fixed supply defaults to BidAsk
        priceModeCtrl.setValue('2');
      } else {
        // Dynamic supply — totalSupply starts at 0, mint on subscribe.
        initialSupplyCtrl.clearValidators();
        initialSupplyCtrl.setValue('');
        // Dynamic supply defaults to Single (NAV-style)
        if (val === '2') priceModeCtrl.setValue('1');
      }
      initialSupplyCtrl.updateValueAndValidity();
    });
  }

  // --- Step navigation ---

  private readonly stepFields: Record<number, string[]> = {
    1: ['tokenType', 'supplyMode', 'priceMode', 'assetType'],
    2: ['name', 'symbol', 'description'],
    3: [],
    4: ['service', 'currency'],
    5: ['owner', 'issuer', 'manager', 'regulator'],
    6: [], // Documents — optional
    7: [], // Images — optional
  };

  isCurrentStepValid(): boolean {
    const step = this.currentStep();
    if (step === 8) return this.addForm.valid && !this.metadataError();
    let fields = this.stepFields[step] ?? [];
    if (step === 1 && this.isFixedSupply) {
      fields = [...fields, 'initialSupply'];
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

  // --- Attachments (Documents + Images steps) ---

  onDocFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length) {
      this.docFiles.update(rows => [
        ...rows,
        ...files.map(file => ({ file, title: '', description: '', documentType: 2 })),
      ]);
    }
    input.value = '';
  }

  onImageFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter(f => f.type.startsWith('image/'));
    if (files.length) {
      this.imageFiles.update(rows => [
        ...rows,
        ...files.map(file => ({
          file, title: '', description: '', documentType: 1,
          role: 'gallery' as const, previewUrl: URL.createObjectURL(file),
        })),
      ]);
    }
    input.value = '';
  }

  updateDocRow(index: number, patch: Partial<WizardDocFile>): void {
    this.docFiles.update(rows => rows.map((r, i) => i === index ? { ...r, ...patch } : r));
  }

  removeDocRow(index: number): void {
    this.docFiles.update(rows => rows.filter((_, i) => i !== index));
  }

  updateImageRow(index: number, patch: Partial<WizardImageFile>): void {
    this.imageFiles.update(rows => rows.map((r, i) => i === index ? { ...r, ...patch } : r));
  }

  // Avatar/banner are single-holder and PUBLIC-only: assigning one demotes the current
  // holder to gallery and forces the row Public (the type select is disabled in the UI).
  setImageRole(index: number, role: 'avatar' | 'banner' | 'gallery'): void {
    this.imageFiles.update(rows => rows.map((r, i) => {
      if (i === index) return { ...r, role, ...(role !== 'gallery' ? { documentType: 1 } : {}) };
      if (role !== 'gallery' && r.role === role) return { ...r, role: 'gallery' as const };
      return r;
    }));
  }

  removeImageRow(index: number): void {
    const row = this.imageFiles()[index];
    if (row?.previewUrl) URL.revokeObjectURL(row.previewUrl);
    this.imageFiles.update(rows => rows.filter((_, i) => i !== index));
  }

  private resetAttachments(): void {
    for (const row of this.imageFiles()) {
      if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
    }
    this.docFiles.set([]);
    this.imageFiles.set([]);
  }

  publicAttachmentCount(): number {
    return this.docFiles().filter(d => d.documentType === 1).length
         + this.imageFiles().filter(d => d.documentType === 1).length;
  }

  imageRoleName(role: string): string {
    return role === 'avatar' ? 'Avatar' : role === 'banner' ? 'Banner' : 'Gallery';
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

    // Default the governance addresses (owner / issuer / manager) to Self — only
    // when still untouched, so re-opening the modal doesn't clobber a manual edit.
    if (entity?.address) {
      for (const field of ['owner', 'issuer', 'manager'] as const) {
        const ctrl = this.addForm.get(field);
        if (ctrl && !ctrl.value) {
          ctrl.setValue(entity.address);
          this.resolveAddress(field);
        }
      }
    }
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

  getTokenTypeName(): string {
    return this.tokenTypes.find(t => t.id === Number(this.addForm.get('tokenType')?.value))?.name ?? '';
  }

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
    return c ? `${c.currencyName} (${c.currencyCode})` : '';
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
    const [countries, entity, approved] = await Promise.all([
      this.apiService.vaultGetCountries(),
      this.apiService.vaultGetEntityInfo(),
      this.apiService.vaultGetApprovedCurrencies('active'),
    ]);
    if (countries) {
      // Narrow the currency picker to the entity's regulator-approved currencies — the asset's
      // currencyCode must be approved or on-chain registerAsset reverts. The picker is country-based
      // (the country's code doubles as the asset currencyCode), so filter by that code.
      const approvedSet = new Set((approved?.currencies ?? []).map((c: any) => Number(c.code)));
      this.countries.set(countries
        .filter((c: any) => approvedSet.has(Number(c.country_code)))
        .map((c: any) => ({
          countryCode: c.country_code,
          nameShort: c.name_short,
          currencyCode: c.currency_code,
          // The picker labels the CURRENCY, not the country — fall back to the country
          // name only when global_countries carries no currency_name for the row.
          currencyName: c.currency_name || c.name_short,
        })));
    }
    if (entity) {
      const regulators = await this.apiService.vaultGetRegulatorsByCountry(String(entity.country_code), 0, 100);
      if (regulators) {
        const active = regulators.filter((r: any) => r.state).map((r: any) => ({
          address: r.address,
          name: r.name,
          symbol: r.symbol,
        }));
        this.regulators.set(active);
        // Default the regulator picker to the entity's own regulator (when present
        // in the active set and the field hasn't already been set/edited).
        const own = entity.regulator ? String(entity.regulator).toLowerCase() : '';
        const regCtrl = this.addForm.get('regulator');
        if (own && regCtrl && !regCtrl.value) {
          const match = active.find((r: any) => r.address.toLowerCase() === own);
          if (match) regCtrl.setValue(match.address);
        }
      }
    }
  }

  async loadSupplyModesAndAssetTypes() {
    // Supply Mode (1=Fixed / 2=Dynamic) comes from the 'Asset Supply Mode' global category.
    // NB: do NOT read 'Asset Token Type' here — that category now holds the token *standard*
    // (T20 / T3643), not the supply mode (relabeled 2026-06-06).
    const [supplyModesRaw, assetTypesRaw] = await Promise.all([
      this.apiService.vaultGetGlobalVariablesByCategory('Asset Supply Mode'),
      this.apiService.vaultGetGlobalVariablesByCategory('Asset Type'),
    ]);
    if (supplyModesRaw) {
      this.supplyModes.set(supplyModesRaw.map((v: any) => ({ id: v.variable_id, name: v.name })));
    }
    if (assetTypesRaw) {
      this.assetTypes.set(assetTypesRaw.map((v: any) => ({ id: v.variable_id, name: v.name })));
    }

    // ISIN's numeric id is Global Variables insertion order, so resolve it by NAME. A chain
    // without the 'ID Type - Asset' category seeded leaves this 0 and the field stays hidden
    // rather than submitting an idType the API would reject.
    try {
      const idTypesRaw = await this.apiService.vaultGetGlobalVariablesByCategory('ID Type - Asset');
      const isin = (idTypesRaw ?? []).find((v: any) => String(v.name).toUpperCase() === ISIN_TYPE_NAME);
      this.isinTypeId.set(isin ? Number(isin.variable_id) : 0);
    } catch {
      this.isinTypeId.set(0);
    }
  }

  // --- ISIN (optional at creation) ---
  // Deliberately ONE optional field rather than the full type picker the detail page uses: an
  // ISIN is frequently assigned after issuance, so the post-creation route is the primary
  // path and this is a convenience for issuers who already have the number.

  isinTypeId = signal(0);
  isinValue = signal('');
  isinError = signal('');

  onIsinChanged(value: string) {
    this.isinValue.set(value);
    // Empty is fine — the field is optional. Only a typed value is judged.
    this.isinError.set(value.trim() ? validateIdentifierValue(ISIN_TYPE_NAME, value) : '');
  }

  // --- Form submission ---

  onSave(): void {
    if (this.addForm.invalid) return;
    const metadataErr = this.validateMetadata();
    if (metadataErr) {
      this.metadataError.set(metadataErr);
      return;
    }

    // Re-check the ISIN before emitting — a paste can bypass the input event.
    const isinRaw = this.isinValue().trim();
    if (isinRaw) {
      const err = validateIdentifierValue(ISIN_TYPE_NAME, isinRaw);
      if (err) { this.isinError.set(err); return; }
    }
    const identifiers = (isinRaw && this.isinTypeId() > 0)
      ? [{ idType: this.isinTypeId(), name: ISIN_TYPE_NAME, value: normalizeIdentifierValue(ISIN_TYPE_NAME, isinRaw) }]
      : [];

    const customMetadata: Record<string, string> = {};
    for (const ctrl of this.metadataRows.controls) {
      const key = (ctrl.controls.key.value ?? '').trim();
      if (!key) continue;
      customMetadata[key] = (ctrl.controls.value.value ?? '').trim();
    }

    const formValue = this.addForm.getRawValue();
    const supplyMode = Number(formValue.supplyMode);
    const priceMode = Number(formValue.priceMode) || 2;
    // tokenType: 1 = TarmiizT20, 2 = TarmiizT3643. The API routes to the matching factory.
    const tokenType = Number(formValue.tokenType) || 1;
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
      // Asset Type (real-world category) is collected for ALL supply modes.
      assetType: Number(formValue.assetType),
      creditSettlement: formValue.noCreditSettlement !== true,
      customMetadata,
      identifiers,
      documents: this.docFiles().map(d => ({ ...d, title: d.title.trim() || d.file.name })),
      images: this.imageFiles().map(d => ({ ...d, title: d.title.trim() || d.file.name })),
      // Initial supply is Fixed-supply-only (minted to the contract at init).
      ...(supplyMode === 1 ? {
        initialSupply: Number(formValue.initialSupply),
      } : {}),
    };
    this.addAssetService.confirm(data);
  }

  onCancel(): void {
    this.addAssetService.cancel();
  }
}
