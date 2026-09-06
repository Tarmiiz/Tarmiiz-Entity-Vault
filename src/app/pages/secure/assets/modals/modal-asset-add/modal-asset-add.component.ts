import { Component, ChangeDetectionStrategy, inject, signal, effect, untracked } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, FormControl, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalAssetAddService, AddAssetData, WizardDocFile, WizardImageFile } from './modal-asset-add.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { ISIN_TYPE_NAME, normalizeIdentifierValue, validateIdentifierValue } from '../../../../../shared/utils/identifier.utils';

/**
 * A regulator-authored class formula (Phase 4.9). The `formula` field IS the contract
 * address — there is no separate id.
 *
 * ⚠️ `supply_policy` / `price_mode_policy` of `0` is NOT "no policy". It means the
 * instance's `ClassRulesInitialized` was never mirrored, i.e. a MISSED EVENT — a formula
 * cannot be created without both policies in 1..3. Treating 0 as "issuer chooses" would
 * turn a sync gap into a silently permissive form, so every branch below tests `=== 3`.
 */
interface ClassFormula {
  formula: string;
  regulator: string;
  base_class: number;
  name: string;
  supply_policy: number;      // 1 Fixed | 2 Dynamic | 3 Issuer chooses
  price_mode_policy: number;  // 1 Fixed-priced | 2 Market-priced | 3 Issuer chooses
  state: number;              // 1 Draft | 2 Active | 3 Retired
}

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
  // ⚠️ Since 4.9 this is DISPLAY vocabulary only — the base class of whichever formula the
  // issuer picks. It is no longer a picker: an issuer selects one of its regulator's named
  // PRODUCTS, never a raw base class, because a base class governs nothing by itself.
  assetClasses = signal<{ id: number; name: string }[]>([]);
  // The regulator's Active class formulas. Empty is a REAL and expected state on a fresh
  // chain — zero formulas exist until a regulator authors one — and it must read as
  // "your regulator has not published a product yet", never as a loading failure.
  formulas = signal<ClassFormula[]>([]);
  formulasLoaded = signal(false);
  // '' = fine · 'regulators' = the country's regulators did not load · 'load' = the formula
  // read itself failed. Three states, because two of them are failures that happen to look
  // exactly like the legitimate empty one.
  formulasError = signal<'' | 'regulators' | 'load'>('');
  // ⚠️ V30 MEANING CHANGE, not a relabel. These were 'Single' (bid == ask) and 'Bid/Ask'
  // (spread allowed) — the shape of a QUOTE, which left every book to guess how to trade the
  // asset. They now say how the asset is PRICED. Both vocabularies use 1 and 2, so the old
  // labels would have kept rendering plausibly over a different meaning.
  priceModes = signal<{ id: number; name: string }[]>([
    { id: 1, name: 'Fixed-priced' },
    { id: 2, name: 'Market-priced' },
  ]);

  // Address resolution
  knownAddresses = signal<{ address: string; name: string }[]>([]);
  entityAddress = signal('');
  ownerName = signal('');
  issuerName = signal('');
  managerName = signal('');

  // The token-STANDARD choice is gone: one standard remains, so there is no second
  // factory to select and nothing for the user to decide.

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
    // supplyMode: 1 = Fixed (initialSupply minted to contract at init), 2 = Dynamic (mint on subscribe).
    supplyMode: ['', Validators.required],
    priceMode: ['2', Validators.required],
    // 4.9 — THE class choice. The issuer names one of its regulator's Active class formulas
    // and everything below is derived from it. `registerAsset` refuses without one and there
    // is no default, so this is the wizard's fail-closed gate.
    formula: ['', Validators.required],
    // assetClass 1..11 — still sent and still IMMUTABLE on the token, but DERIVED from the
    // formula now rather than chosen. `registerAsset` checks the token's declared base class
    // against the formula's, so offering a separate picker would only build reverting
    // transactions.
    assetClass: ['', Validators.required],
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

  // A5 — THE CLASS *IS* THE SUPPLY MODEL. Mirrored from the Assets Registry's
  // AssetClassLib.supplyModeFor, which is the authority: `Assets.create` refuses a pair that
  // does not match (`supplyModeMatches`), so a wrong guess here is a revert, not a preference.
  // `0` means the issuer chooses, and only class 11 (Custom) is allowed that.
  //
  // This exists because the supply-mode PICKER was removed from step 1 when the class took over
  // — but the control kept `Validators.required` and kept its place in `stepFields[1]`, so it
  // could never be satisfied and **Next was dead for every asset**. Nothing rendered an error
  // either: a disabled Next with all visible fields filled reads as a UI glitch, not a blocked
  // form. The same omission also hid the Initial Supply input, which renders on `isFixedSupply`.
  // ⚠️ `SUPPLY_MODE_FOR_CLASS` IS DELETED (Phase 4.9). It was a verbatim mirror of
  // `AssetClassLib.supplyModeFor`, and that function no longer exists: the class → supply
  // map, the per-row defaults and the per-role independence rules were all removed from the
  // library, because a base class now fixes NOTHING. The supply model is the FORMULA's
  // policy — the regulator's choice per product — so "Sukuk" and "Conventional Bond" can
  // differ over the same base class 3, which is precisely what the old map could not say.
  //
  // The class-11-is-special branch went with it. "Custom lets the issuer choose" stopped
  // being a class fact: ANY formula may set `supply_policy = 3` (Issuer chooses), and a
  // Custom-class formula may equally pin one.

  /** The formula the issuer selected — the source of truth for class, supply and price. */
  get selectedFormula(): ClassFormula | null {
    const addr = String(this.addForm.get('formula')?.value ?? '').toLowerCase();
    if (!addr) return null;
    return this.formulas().find(f => f.formula.toLowerCase() === addr) ?? null;
  }

  /** True when the formula leaves the supply model to the issuer (policy 3). */
  get issuerChoosesSupply(): boolean {
    return this.selectedFormula?.supply_policy === 3;
  }

  /** True when the formula leaves the price mode to the issuer (policy 3). */
  get issuerChoosesPriceMode(): boolean {
    return this.selectedFormula?.price_mode_policy === 3;
  }

  /** Human label for a supply model the FORMULA pins — '' when the issuer chooses it. */
  get derivedSupplyModeName(): string {
    if (this.issuerChoosesSupply) return '';
    const mode = Number(this.addForm.get('supplyMode')?.value);
    if (!mode) return '';
    return this.supplyModes().find(s => s.id === mode)?.name ?? '';
  }

  /** Human label for a price mode the FORMULA pins — '' when the issuer chooses it. */
  get derivedPriceModeName(): string {
    if (this.issuerChoosesPriceMode) return '';
    const mode = Number(this.addForm.get('priceMode')?.value);
    if (!mode) return '';
    return this.priceModes().find(p => p.id === mode)?.name ?? '';
  }

  /** The BASE class the selected formula is built over — display only since 4.9. */
  get formulaBaseClassName(): string {
    const f = this.selectedFormula;
    if (!f) return '';
    return this.assetClasses().find(c => c.id === f.base_class)?.name ?? ('Class ' + f.base_class);
  }

  /** The regulator that authored the selected formula — it IS the asset's regulator. */
  get formulaRegulatorName(): string {
    const f = this.selectedFormula;
    if (!f) return '';
    const r = this.regulators().find(x => x.address.toLowerCase() === f.regulator.toLowerCase());
    return r ? `${r.name} (${r.symbol})` : f.regulator;
  }

  /** One picker line: "Green Sukuk — FRA · Debt / Sukuk". */
  /*
      🔴 THE ADDRESS IS PART OF THE LABEL BECAUSE THE NAME IS NOT UNIQUE.

      Nothing on chain enforces a unique formula name — a formula is selected by ADDRESS
      (`registerAsset(asset, formula)`), so duplicates are not ambiguous to the CODE and the
      contract has no reason to refuse them. The ambiguity is entirely here, at the human
      selection surface: a regulator with three products called "Money Market Fund" produced
      three IDENTICAL option strings, because name + regulator + base class are all shared.
      The issuer picked one at random and had no way to tell which.

      ⚠️ Truncated, and LAST, so it disambiguates without competing with the name. It stays
      useful after per-regulator uniqueness lands on chain — an operator still wants to know
      which contract they are binding an asset to.
  */
  formulaLabel(f: ClassFormula): string {
    const reg = this.regulators().find(x => x.address.toLowerCase() === f.regulator.toLowerCase());
    const cls = this.assetClasses().find(c => c.id === f.base_class)?.name ?? ('Class ' + f.base_class);
    // Inlined rather than adding a fourth local truncation helper — this app already carries three
    // with two different lengths. `0,6…-4` is the dominant one; a shared helper is worth doing, but
    // as its own tidy, not smuggled into a picker fix.
    const short = f.formula ? `${f.formula.slice(0, 6)}…${f.formula.slice(-4)}` : '';
    return `${f.name} — ${reg ? reg.symbol : f.regulator.slice(0, 8)} · ${cls} · ${short}`;
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
        this.metadataRows.clear();
        this.addMetadataRow();
        this.metadataError.set('');
        // untracked: resetAttachments reads + writes the attachment signals — tracked here,
        // that read would register them as effect deps and the writes would re-trigger the
        // effect forever (fresh [] reference each run), hanging the UI on modal open.
        untracked(() => this.resetAttachments());
        this.currentStep.set(1);
        this.formulasLoaded.set(false);
        this.formulasError.set('');
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

    // 4.9 — THE FORMULA DERIVES EVERYTHING: base class, supply model, price mode AND the
    // regulator. Each of the four is re-checked on chain against this same formula, so a
    // picker that let them disagree would only offer ways to build a reverting transaction.
    //
    // ⚠️ The REGULATOR is derived too, and that is the change most worth reading twice. It
    // used to be a free choice on step 5, which meant an issuer could pick "Green Sukuk"
    // (authored by FRA) and then select a different regulator — a combination `registerAsset`
    // refuses, discovered only after the token had already been DEPLOYED. A formula belongs
    // to exactly one regulator, so selecting the product settles the authority: the invalid
    // pair becomes unrepresentable rather than validated.
    this.addForm.get('formula')!.valueChanges.subscribe(val => {
      const f = this.formulas().find(x => x.formula.toLowerCase() === String(val ?? '').toLowerCase());
      const supplyCtrl = this.addForm.get('supplyMode')!;
      const priceCtrl  = this.addForm.get('priceMode')!;
      const classCtrl  = this.addForm.get('assetClass')!;
      const regCtrl    = this.addForm.get('regulator')!;
      if (!f) {
        classCtrl.setValue('');
        supplyCtrl.setValue('');
        return;
      }
      classCtrl.setValue(String(f.base_class));
      regCtrl.setValue(f.regulator);
      // Policy 3 = Issuer chooses ⇒ clear so `Validators.required` blocks Next until they
      // pick. Anything else is PINNED by the regulator and set here. A policy of 0 is a
      // missed `ClassRulesInitialized`, never a choice — it falls into this branch and sets
      // an invalid supplyMode, which the API rejects with a clear 400 rather than deploying.
      supplyCtrl.setValue(f.supply_policy === 3 ? '' : String(f.supply_policy));
      if (f.price_mode_policy !== 3) priceCtrl.setValue(String(f.price_mode_policy));
    });

    // Conditional validators driven by supplyMode (Fixed vs Dynamic).
    // Note: assetType is required for ALL supply modes (it's the real-world category),
    // so it is NOT touched here — only initialSupply + the priceMode default are.
    this.addForm.get('supplyMode')!.valueChanges.subscribe(val => {
      const initialSupplyCtrl = this.addForm.get('initialSupply')!;
      const priceModeCtrl = this.addForm.get('priceMode')!;
      // ⚠️ 4.9 — THE PRICE-MODE DEFAULTS ONLY APPLY WHEN THE FORMULA LEAVES THE CHOICE OPEN.
      // These lines used to fire unconditionally, which after 4.9 would have silently
      // OVERWRITTEN a price mode the regulator pinned on the formula: pick a Market-priced
      // product, watch the supply model derive, and the price mode flips back under you. The
      // asset then reverts at registration against its own formula's policy.
      const priceIsIssuers = this.issuerChoosesPriceMode;
      if (val === '1') {
        // Fixed supply — initialSupply minted to contract at init.
        initialSupplyCtrl.setValidators([Validators.required, Validators.min(0)]);
        // Fixed supply suggests Market-priced.
        if (priceIsIssuers) priceModeCtrl.setValue('2');
      } else {
        // Dynamic supply — totalSupply starts at 0, mint on subscribe.
        initialSupplyCtrl.clearValidators();
        initialSupplyCtrl.setValue('');
        // Dynamic supply suggests Fixed-priced (NAV-style).
        if (val === '2' && priceIsIssuers) priceModeCtrl.setValue('1');
      }
      initialSupplyCtrl.updateValueAndValidity();
    });
  }

  // --- Step navigation ---

  private readonly stepFields: Record<number, string[]> = {
    // `formula` first — it derives assetClass, supplyMode, priceMode AND regulator, so all
    // four are validated here even though only supplyMode can still need a human answer.
    1: ['formula', 'supplyMode', 'priceMode', 'assetClass'],
    2: ['name', 'symbol', 'description'],
    3: [],
    4: ['service', 'currency'],
    // `regulator` MOVED OUT (4.9): it is no longer a choice — the class formula's author IS
    // the asset's regulator, and it is set on step 1. Leaving it here would have gated Next
    // on a control the user can no longer see or edit.
    5: ['owner', 'issuer', 'manager'],
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
    return 'Tarmiiz T20';   // the only standard
  }

  getSupplyModeName(): string {
    return this.supplyModes().find(t => t.id === Number(this.addForm.get('supplyMode')?.value))?.name ?? '';
  }

  getAssetTypeName(): string {
    return this.assetClasses().find(t => t.id === Number(this.addForm.get('assetClass')?.value))?.name ?? '';
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
      // Chained deliberately, not run in parallel with the regulator fetch: the picker
      // labels each formula with its authoring regulator, and the formulas are narrowed to
      // this country's regulators. Firing both at once would race, and the loser is silent —
      // an unlabelled or over-wide list, not an error.
      await this.loadFormulas();
    }
  }

  /**
   * Phase 4.9 — the Active class formulas this issuer may register under.
   *
   * Narrowed to the regulators of the entity's own country, because the asset's
   * `countryCode` must equal its regulator's (`registerAsset` validates it) and a formula
   * is only usable under the regulator that authored it. A foreign regulator's product
   * would render perfectly and revert at the last step of a flow that has already deployed
   * the token.
   *
   * ⚠️ Only state 2 (Active). Draft and Retired formulas cannot take a NEW registration.
   * The API defaults to this too — asked for explicitly here so the intent survives a
   * change to that default.
   */
  async loadFormulas() {
    this.formulasError.set('');
    // ⚠️ NO REGULATORS IS A DIFFERENT FACT FROM NO FORMULAS, and it must not render as one.
    // Both produce an empty dropdown, but one says "your regulator has published no products
    // yet" (correct, expected on a fresh chain) and the other says "this app could not read
    // your country's regulators" (a failure). Collapsing them moves the confusion from a late
    // revert to a silent blank, which is harder to diagnose precisely because nothing failed.
    if (this.regulators().length === 0) {
      this.formulas.set([]);
      this.formulasError.set('regulators');
      this.formulasLoaded.set(true);
      return;
    }
    try {
      const rows = await this.apiService.assetClassFormulas({ state: 2 });
      // `null` is the api service's signal that the CALL failed; `[]` is a real empty answer.
      // Treating the first as the second is the same collapse again, one layer down.
      if (rows === null) {
        this.formulas.set([]);
        this.formulasError.set('load');
        return;
      }
      const known = new Set(this.regulators().map(r => r.address.toLowerCase()));
      this.formulas.set(rows.filter((f: ClassFormula) => known.has(String(f.regulator).toLowerCase())));
    } catch {
      this.formulas.set([]);
      this.formulasError.set('load');
    } finally {
      this.formulasLoaded.set(true);
    }
  }

  /** The regulators the empty state names, so "none published" is attributable to someone. */
  regulatorNames(): string {
    return this.regulators().map(r => `${r.name} (${r.symbol})`).join(', ');
  }

  async loadSupplyModesAndAssetTypes() {
    // Supply Mode (1=Fixed / 2=Dynamic) comes from the 'Asset Supply Mode' global category.
    // 'Asset Class' REPLACES 'Asset Type' (which overlapped this catalog and carried nothing),
    // and 'Asset Token Type' is gone with the second standard.
    const [supplyModesRaw, assetClassesRaw] = await Promise.all([
      this.apiService.vaultGetGlobalVariablesByCategory('Asset Supply Mode'),
      this.apiService.vaultGetGlobalVariablesByCategory('Asset Class'),
    ]);
    if (supplyModesRaw) {
      this.supplyModes.set(supplyModesRaw.map((v: any) => ({ id: v.variable_id, name: v.name })));
    }
    if (assetClassesRaw) {
      this.assetClasses.set(assetClassesRaw.map((v: any) => ({ id: v.variable_id, name: v.name })));
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
      supplyMode,
      priceMode,
      // 4.9 — the class formula the regulator authored. REQUIRED, no default: `registerAsset`
      // refuses without it, and the API refuses BEFORE deploying the token, because a late
      // refusal strands a real contract holding this name and symbol forever.
      formula: formValue.formula ?? '',
      // The A1 BASE class — derived from the formula above, not chosen. Still sent because
      // the token declares it and `registerAsset` checks the two agree.
      assetClass: Number(formValue.assetClass),
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
