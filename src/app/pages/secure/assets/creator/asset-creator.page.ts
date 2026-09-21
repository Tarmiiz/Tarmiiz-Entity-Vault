import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, FormControl, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AddAssetData, WizardDocFile, WizardImageFile } from './asset-creator.model';
import { ApiService } from '../../../../shared/services/api.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { ISIN_TYPE_NAME, normalizeIdentifierValue, validateIdentifierValue } from '../../../../shared/utils/identifier.utils';

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

/**
 * Asset Creator — the issuer's create wizard as a routed PAGE (R18 / Phase 4.9, A2 2026-09-10;
 * frontend Standard 2.5, the app's first stepped page).
 *
 * Until 2026-09-10 this was `modal-asset-add` (864 + 621 lines) opened from the assets list, and
 * the list page performed the create + attachment uploads after the dialog resolved. Promoted in
 * place — same steps, same stepper — because a wizard of this size is a destination, not an
 * interruption of a list, and a page has no backdrop to lose it to. What changed in the shell:
 *   · the step lives in `?step=N`, so refresh and back behave (a signal alone would reproduce
 *     the modal's worst property on a page);
 *   · Cancel routes to the list behind an AlertService confirm when work is in flight, and the
 *     route's `canDeactivate` runs the same confirm for the sidebar / browser exits;
 *   · the create-then-upload flow moved HERE, where the data is, and lands on the new asset.
 * Reachability: menu key `asset-creator`. The submit stays gated by the `asset-create` System
 * Function — one act, one key; the page mints no second one.
 */
@Component({
  selector: 'app-asset-creator',
  templateUrl: './asset-creator.page.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe, HeaderComponent, RouterLink],
})
export class AssetCreatorPage {

  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private translate = inject(TranslateService);
  utils = inject(UtilsService);
  features = inject(FeaturesService);

  /** Set once the create has landed, so the leave guard stops asking. */
  private submitted = false;

  // Reference data
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
  formulasError = signal<'' | 'regulators' | 'load' | 'grants'>('');
  // Phase 4.2 (as Phase 17 rows, 2026-09-10) — the base classes this ISSUER may issue, read
  // from the chain with the formulas. The picker offers only formulas over a granted class:
  // `Assets.registerAsset` refuses the rest, after the token has been deployed. `null` means
  // the grants read FAILED, and a failed read hides NOTHING — every formula stays offered and
  // the failure is named — because "you may issue no class" is the reassuring rendering of an
  // outage and the wrong one.
  grantedClasses = signal<Set<number> | null>(null);
  grantsReadFailed = signal(false);
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

  /*
      HIDDEN STEPS — hidden, deliberately NOT removed.

      Step 5 (Roles) is skipped because every value on it is already correct by default: owner,
      issuer and manager all default to this entity, and the regulator is fixed by the class
      definition chosen in step 4. Asking three times for an answer the form already holds is a
      question with one acceptable reply.

      ⚠️ THE STEP NUMBERING IS UNCHANGED — 1..8, with 5 simply never visited. Renumbering would
      have been the tempting simplification and it is a trap: the template gates every panel on
      `currentStep() === N`, `stepFields` is keyed by the same N, and `isCurrentStepValid` special-
      cases step 8. Shifting them means editing four parallel lists in lockstep, and re-showing the
      step later means doing it again in reverse. Skipping costs one Set.

      To bring it back: empty this Set. Nothing else changes — the panel, its controls, its
      validators and its defaults are all still here and still wired.
  */
  private static readonly HIDDEN_STEPS = new Set<number>([5]);
  private isHidden = (n: number) => AssetCreatorPage.HIDDEN_STEPS.has(n);

  readonly totalSteps = 8;
  readonly stepLabels = ['Standard & Supply', 'Identity', 'Metadata', 'Currency', 'Roles', 'Documents', 'Images', 'Review'];
  /** The dots actually drawn, and the source of the "Step X of Y" counter. */
  readonly stepNumbers = [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => !AssetCreatorPage.HIDDEN_STEPS.has(n));
  /** Visible count, so the header does not promise a step the user will never see. */
  get visibleTotal(): number { return this.stepNumbers.length; }
  /** 1-based position of the current step AMONG THE VISIBLE ones. */
  get visibleIndex(): number { return this.stepNumbers.indexOf(this.currentStep()) + 1; }
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
    // ERC-20 decimals, 0..255, default 0 = whole units (the platform default — see the model).
    decimals: ['0', [Validators.required, Validators.pattern(/^\d{1,3}$/), Validators.min(0), Validators.max(255)]],
    description: ['', Validators.required],
    // AS.1 (33.A) — NO `service` control. An asset is created WITHOUT its issuing service; the
    // service is set afterwards on the asset's detail page (the Issuing service card).
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

  /** Fresh wizard on every entry — the page equivalent of the modal's open-effect reset. */
  ionViewWillEnter() {
    this.submitted = false;
    this.addForm.reset({ noCreditSettlement: false });
    this.metadataRows.clear();
    this.addMetadataRow();
    this.metadataError.set('');
    this.resetAttachments();
    this.formulasLoaded.set(false);
    this.formulasError.set('');
    this.symbolAvailable.set(null);
    this.symbolCheckPending.set(false);
    this.reviewConfirmed.set(false);
    this.ownerName.set('');
    this.issuerName.set('');
    this.managerName.set('');
    // The route is the step's home. A refresh lands on the step the URL names (its earlier
    // steps are re-validated by Next, never assumed), anything unparseable or hidden lands on 1.
    const wanted = Number(this.route.snapshot.queryParamMap.get('step'));
    const step = Number.isInteger(wanted) && wanted >= 1 && wanted <= this.totalSteps && !this.isHidden(wanted) ? wanted : 1;
    this.currentStep.set(step);
    this.syncStepToUrl(step);
    this.loadCountriesAndRegulators();
    this.loadSupplyModesAndAssetTypes();
    this.loadKnownAddresses();
  }

  private syncStepToUrl(step: number): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { step }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Anything typed, attached or advanced counts as work in flight. */
  private hasWorkInFlight(): boolean {
    return this.addForm.dirty || this.currentStep() > 1 || this.docFiles().length > 0 || this.imageFiles().length > 0;
  }

  /**
   * Route `canDeactivate` — the sidebar and the browser are exits too, so the confirm that Cancel
   * shows is bound to the ROUTE, not only to the one button (Standard 2.5).
   */
  async canLeave(): Promise<boolean> {
    if (this.submitted || !this.hasWorkInFlight()) return true;
    return this.alertService.show(
      this.translate.instant('assets.creator.leaveTitle'),
      this.translate.instant('assets.creator.leaveMsg'),
      this.translate.instant('assets.creator.leaveConfirm'),
    );
  }

  constructor() {
    this.metadataRows.valueChanges.subscribe(() => {
      this.metadataError.set(this.validateMetadata());
    });

    // AS.1 (ruling (a), 2026-09-21) — the credit-settlement opt-out is NO LONGER forced by the
    // chosen service's payment processor: there is no service at creation. The contract never
    // conditioned the flag on a PP (the gate was UX); the PP warning lives on the Issuing
    // service card, and the flag stays a manager act afterwards (setCreditSettlement).

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
    4: ['currency'],
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

  /** Next VISIBLE step. Walks past hidden ones rather than renumbering them away. */
  private step(from: number, dir: 1 | -1): number {
    let n = from + dir;
    while (n >= 1 && n <= this.totalSteps && this.isHidden(n)) n += dir;
    return n;
  }

  nextStep(): void {
    if (!this.isCurrentStepValid() || this.currentStep() >= this.totalSteps) return;
    if (this.currentStep() === 2) {
      this.symbolCheckPending.set(true);
    }
    if (this.currentStep() === 4 && this.symbolCheckPending()) {
      this.checkSymbolAvailability();
    }
    this.currentStep.update(s => this.step(s, 1));
    this.syncStepToUrl(this.currentStep());
  }

  prevStep(): void {
    if (this.currentStep() > 1) {
      this.currentStep.update(s => this.step(s, -1));
      this.syncStepToUrl(this.currentStep());
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

  getCurrencyDisplay(): string {
    const c = this.countries().find(c => c.countryCode === Number(this.addForm.get('currency')?.value));
    return c ? `${c.currencyName} (${c.currencyCode})` : '';
  }

  getRegulatorDisplay(): string {
    const r = this.regulators().find(r => r.address === this.addForm.get('regulator')?.value);
    return r ? `${r.name} (${r.symbol})` : '';
  }

  // --- Data loading ---

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
      const [rows, grants] = await Promise.all([
        this.apiService.assetClassFormulas({ state: 2 }),
        this.apiService.vaultGetEntityGrants(),
      ]);
      // `null` is the api service's signal that the CALL failed; `[]` is a real empty answer.
      // Treating the first as the second is the same collapse again, one layer down.
      if (rows === null) {
        this.formulas.set([]);
        this.formulasError.set('load');
        return;
      }
      const known = new Set(this.regulators().map(r => r.address.toLowerCase()));
      const ofMyRegulators = rows.filter((f: ClassFormula) => known.has(String(f.regulator).toLowerCase()));

      // Phase 4.2 — narrow to the classes this issuer is GRANTED. A failed grants read (the call,
      // or any single row) keeps every formula and flags it; only a successful read narrows.
      if (!grants || grants.readFailed) {
        this.grantedClasses.set(null);
        this.grantsReadFailed.set(true);
        this.formulas.set(ofMyRegulators);
        return;
      }
      const granted = new Set(grants.classes.filter(c => c.granted).map(c => Number(c.classId)));
      this.grantedClasses.set(granted);
      this.grantsReadFailed.set(false);
      const usable = ofMyRegulators.filter((f: ClassFormula) => granted.has(Number(f.base_class)));
      this.formulas.set(usable);
      // Formulas exist but none is over a class this issuer may issue: a DIFFERENT fact from
      // "no formulas published", and it names the regulator's grant, not its catalog.
      if (ofMyRegulators.length > 0 && usable.length === 0) this.formulasError.set('grants');
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
      decimals: Number(formValue.decimals) || 0,
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
    void this.submit(data);
  }

  /**
   * The create + attachment uploads. Moved from the assets LIST page (which used to await the
   * modal's promise) into the page that owns the data. Lands on the new asset's detail page;
   * a failed create stays here with everything the issuer typed still in place.
   */
  private async submit(data: AddAssetData): Promise<void> {
    this.loadingService.show(this.translate.instant('assets.addModal.submitting'));
    try {
      const result = await this.apiService.vaultCreateAsset({
        owner: data.owner,
        issuer: data.issuer,
        manager: data.manager,
        name: data.name,
        symbol: data.symbol,
        // `identifiers` is server-owned: the API re-validates and rebuilds it here, and after
        // creation only PUT/DELETE /assets/:address/identifiers may touch it.
        metadata: JSON.stringify({
          description: data.description,
          ...data.customMetadata,
          ...(data.identifiers?.length ? { identifiers: data.identifiers } : {}),
        }),
        currency: data.currency,
        regulator: data.regulator,
        supplyMode: data.supplyMode,
        priceMode: data.priceMode,
        creditSettlement: data.creditSettlement,
        // ⚠️ NO `|| 0` fallback. `assetClass` 0 is not "unspecified", it is INVALID (valid is
        // 1..11) — sending it would trade the API's clear 400 for an opaque revert inside
        // registerAsset, on a value that can never be changed afterwards.
        assetClass: data.assetClass,
        // 4.9 — the regulator's class formula. NO fallback either: the API refuses a missing
        // formula BEFORE it deploys the token, because a refusal after the deploy would strand
        // a real contract holding this name and symbol in this country forever.
        formula: data.formula,
        decimals: data.decimals,
        ...(data.supplyMode === 1 ? { initialSupply: data.initialSupply } : {}),
      });
      if (result?.type === 'success') {
        // Attachments upload AFTER create — documents attach to the new asset's address.
        // The API auto-folds public docs/images into the asset metadata's `media` key per upload.
        if (result.address && (data.documents.length || data.images.length)) {
          await this.uploadAssetAttachments(result.address, data);
        }
        this.submitted = true;
        /*
            ⚠️ HIDE BEFORE THE ALERT, NOT IN `finally` — the asset was created and the operator
            was then stuck (2026-09-14).

            `alertService.info` resolves when the user clicks OK, so awaiting it inside the `try`
            leaves the loading overlay up for the whole time the alert is on screen — and the
            overlay renders ABOVE it. "Creating asset on-chain…" sat spinning over a success
            dialog whose OK button it was covering: the work was finished, the UI said it was
            still running, and the only escape was a page reload.
            Only the SUCCESS path had it: the two error branches below do not await, so their
            `finally` fires immediately. That is why it looked like creation had hung rather
            than like an overlay bug.
            `hide()` is a plain signal set, so the `finally` calling it again is harmless — it
            stays as the backstop for the paths that throw.
        */
        this.loadingService.hide();
        await this.alertService.info(
          this.translate.instant('assets.creator.createdTitle'),
          this.translate.instant('assets.creator.createdMsg', { name: data.name, symbol: data.symbol }),
        );
        this.router.navigate(result.address ? ['/authorized/assets/details/' + result.address] : ['/authorized/assets/list']);
      } else {
        this.alertService.info(this.translate.instant('alerts.error'), result?.error || this.translate.instant('assets.list.createFailed'));
      }
    } catch {
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  // Sequential post-create upload of the wizard's documents + images. Continues past
  // per-file failures (the asset already exists) and reports them in one summary alert —
  // failed files can be re-added from the asset's Documents tab / Images section.
  private async uploadAssetAttachments(address: string, data: { documents: WizardDocFile[]; images: WizardImageFile[] }) {
    const queue = [
      ...data.documents.map(d => ({ ...d, imageRole: undefined as string | undefined })),
      ...data.images.map(d => ({ ...d, imageRole: d.role !== 'gallery' ? d.role : undefined })),
    ];
    const failures: string[] = [];
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const label = item.title || item.file.name;
      this.loadingService.show(this.translate.instant('assets.addModal.uploadingAttachment', { current: i + 1, total: queue.length, name: label }));
      const res = await this.apiService.assetDocumentAddMultipart(address, item.file, {
        title: item.title,
        description: item.description,
        fileType: item.file.type,
        documentType: item.documentType,
        documentState: 1,
        ...(item.imageRole ? { imageRole: item.imageRole } : {}),
      });
      if (res?.error) failures.push(`${label}: ${res.error}`);
    }
    if (failures.length) {
      // Same trap as the create path above: the per-file `show()` in the loop is still up, and an
      // awaited alert would sit UNDER it with its OK button covered. Hide first; the caller's
      // `finally` hides again harmlessly.
      this.loadingService.hide();
      await this.alertService.info(
        this.translate.instant('assets.addModal.attachmentFailuresTitle'),
        this.translate.instant('assets.addModal.attachmentFailuresMessage', { failed: failures.length, total: queue.length }) + '\n' + failures.join('\n')
      );
    }
  }

  /** Cancel routes to the list; with work in flight it asks first (the route guard asks too). */
  async onCancel(): Promise<void> {
    if (this.hasWorkInFlight()) {
      const ok = await this.alertService.show(
        this.translate.instant('assets.creator.cancelTitle'),
        this.translate.instant('assets.creator.cancelMsg'),
        this.translate.instant('assets.creator.leaveConfirm'),
      );
      if (!ok) return;
    }
    this.submitted = true;   // the guard has been answered here; do not ask twice
    this.router.navigate(['/authorized/assets/list']);
  }
}
