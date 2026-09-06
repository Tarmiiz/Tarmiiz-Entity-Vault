import { Component, ChangeDetectionStrategy, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ApiService } from '../../../../../shared/services/api.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { RefreshButtonComponent } from '../../../../../shared/components/refresh-button/refresh-button.component';
import { DocumentsTabComponent } from '../../../../../shared/components/documents-tab/documents-tab.component';
import { ModalDocumentPickerComponent } from '../../../../../shared/components/modal-document-picker/modal-document-picker.component';
import { ModalDocumentPickerService } from '../../../../../shared/components/modal-document-picker/modal-document-picker.service';
import { ModalPartyPickerComponent } from '../../../../../shared/components/modal-party-picker/modal-party-picker.component';
import { ModalPartyPickerService } from '../../../../../shared/components/modal-party-picker/modal-party-picker.service';

/*
    THE ASSET'S COMPLIANCE TAB — the A8 registration lifecycle, the A9 profile, the A24
    composition and the A2 party set, as four sub-tabs on one rail.

    Extracted from `details.page.html` (it was ~280 lines inside a 1752-line template) and
    reorganised, following the `documents-tab` precedent for a tab that owns its own data.

    WHY IT IS LABELLED "Compliance" WHILE EVERY IDENTIFIER HERE SAYS "registration":
    deliberate, and the split is the mitigation. The chain's lifecycle noun is registration
    (`registerAsset`, `approvalState`), and by the time an operator reaches this tab the asset
    IS registered — what is outstanding is the declaration, the evidence and the parties. So
    the DISPLAY name is Compliance and every CODE name — the API routes, the parent page's
    `activeTab()` key, the contract functions — stays `registration` / `assetClass`. The
    Declaration sub-tab names its first section "Compliance profile" so the narrow on-chain
    meaning of that word stays visible exactly where it applies.

    Three steps, in A8's order:
      1. DECLARE  — compliance profile (A9) + the pinned legal wrapper document.
      2. COMPOSE + ATTACH — a Custom asset says WHAT it needs (A24), then WHO provides it (A2).
      3. APPROVE  — the regulator's, on the Regulator Dashboard.

    Everything here is pre-approval by construction: the API refuses a declaration once the
    state leaves 1 and refuses a composition once frozen. We surface those refusals rather
    than re-implementing them.
*/

export type ComplianceRail = 'info' | 'declaration' | 'documents' | 'parties';

/** The evidence row every class requires, and the only one with an on-chain slot. */
const REQ_LEGAL_WRAPPER = 1;

/** `AssetClassLib.CLASS_CUSTOM` — the only class whose issuer composes its own requirements. */
const CLASS_CUSTOM = 11;

type StatusKind = 'satisfied' | 'missing' | 'untracked';

@Component({
  selector: 'app-asset-compliance-tab',
  templateUrl: './compliance-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    FormsModule, TranslatePipe,
    RefreshButtonComponent, DocumentsTabComponent,
    ModalDocumentPickerComponent, ModalPartyPickerComponent,
  ],
})
export class ComplianceTabComponent implements OnChanges {

  @Input() address = '';
  @Input() entityActive = true;
  /** The parent already resolves this from the asset — do not re-derive it here. */
  @Input() canManage = false;

  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private translate = inject(TranslateService);
  private docPicker = inject(ModalDocumentPickerService);
  private partyPicker = inject(ModalPartyPickerService);
  features = inject(FeaturesService);

  get userInfo() { return this.authService.userInfo; }
  isViewer() { return !this.userInfo || this.userInfo.role === 3; }

  rail = signal<ComplianceRail>('info');
  goTo(tab: ComplianceRail) { this.rail.set(tab); }

  /** Hoisted, not inlined in the template — a literal there is a fresh array every check. */
  readonly RAIL: { key: ComplianceRail; label: string }[] = [
    { key: 'info',        label: 'assets.details.compliance.railInfo' },
    { key: 'declaration', label: 'assets.details.compliance.railDeclaration' },
    { key: 'documents',   label: 'assets.details.compliance.railDocuments' },
    { key: 'parties',     label: 'assets.details.compliance.railParties' },
  ];

  registration = signal<any | null>(null);
  registrationLoading = signal(false);
  classCatalog = signal<{ requirements: any[]; roles: any[] } | null>(null);

  /** Working set for the composition editor — mirrors the on-chain set until Save. */
  compositionDraft = signal<number[]>([]);
  compositionSaving = signal(false);

  /** Reference data for the two profile fields the Vault could not previously declare. */
  countries = signal<{ countryCode: number; name: string }[]>([]);
  claimTopics = signal<{ id: number; name: string }[]>([]);

  declarationForm = signal<{
    holderCap: string; minTicket: string; maxTicket: string; lockupUntil: string;
    legalWrapperDocumentId: string; requiredClaimTopic: string; requiredClaimLevel: string;
  }>({
    holderCap: '', minTicket: '', maxTicket: '', lockupUntil: '',
    legalWrapperDocumentId: '', requiredClaimTopic: '', requiredClaimLevel: '',
  });

  /** Selected ISO numeric codes. Empty = every jurisdiction, which is the contract's meaning. */
  jurisdictions = signal<number[]>([]);
  jurisdictionToAdd = signal<string>('');

  /**
   * Set when the stored `requiredClaimTopic` is non-zero but is NOT one of the catalog ids.
   * The dropdown then cannot represent it, so it is shown raw and preserved on save — the
   * alternative is rendering an unknown topic as "None" and silently clearing it on the next
   * save of an unrelated field.
   */
  unknownClaimTopic = signal('');

  /** Resolved title of the pinned wrapper, so the field shows a document and not a number. */
  legalWrapperTitle = signal('');

  ngOnChanges(changes: SimpleChanges) {
    if (changes['address'] && this.address) this.load();
  }

  // ── label maps ────────────────────────────────────────────────────────────────

  roleName(role: number) {
    const c = this.classCatalog();
    return c?.roles?.find((r) => Number(r.role) === Number(role))?.name || `Role ${role}`;
  }

  /**
   * The name to show for a requirement's party — the REGULATOR'S named role definition where
   * there is one, falling back to the platform's base role.
   *
   * ⚠️ Since 4.9 a row demands a role DEFINITION, not a base role, and two rows may demand
   * different definitions over the same base role ("Real Estate Valuer (RICS)" and "Fine Art
   * Appraiser" are both base role 1). Rendering `roleName(r.role)` would print the same word
   * twice and make two distinct obligations look like one.
   */
  requirementRoleName(r: any) {
    return r?.roleName || (Number(r?.role) ? this.roleName(Number(r.role)) : '');
  }

  /** Whether an issuer-owned party may fill this row — the regulator's call on the definition. */
  independenceWaived(r: any) { return Number(r?.independence) === 2; }

  reqStateName(state: number) {
    // ⚠️ 0 is UNSET, and since 4.9 it falls through to NOTHING — `AssetClassLib`'s model
    // defaults are deleted, so an unset row demands nothing at all. It still is not the same
    // fact as "Off": Off is a regulator's recorded refusal, Unset is silence. Both resolve
    // the same way; only one leaves a record, which is why the two labels stay distinct.
    return ({ 0: 'Not set', 1: 'Required', 2: 'Optional', 3: 'Off' } as Record<number, string>)[Number(state)] ?? String(state);
  }

  // ── Phase 4.9 — the class formula ────────────────────────────────────────────
  //
  // The product the regulator published and this asset was issued under. Everything in the
  // matrix below comes from it; the base class no longer decides anything on its own.

  formula()          { return this.registration()?.formula ?? null; }
  formulaName()      { return this.formula()?.name ?? ''; }
  formulaStateName() {
    return ({ 1: 'Draft', 2: 'Active', 3: 'Retired' } as Record<number, string>)[Number(this.formula()?.state)] ?? '';
  }
  supplyPolicyName() {
    return ({ 1: 'Fixed', 2: 'Dynamic', 3: 'Issuer chooses' } as Record<number, string>)[Number(this.formula()?.supplyPolicy)] ?? '';
  }
  priceModePolicyName() {
    return ({ 1: 'Fixed-priced', 2: 'Market-priced', 3: 'Issuer chooses' } as Record<number, string>)[Number(this.formula()?.priceModePolicy)] ?? '';
  }
  /** The regulator's own named document rows (R5b) that this formula requires or offers. */
  formulaDocuments() {
    return (this.formula()?.documents ?? []).filter((d: any) => Number(d.state) === 1 || Number(d.state) === 2);
  }
  /** The permitted A23 standards — the regulator half of A23, which had no display before. */
  formulaStandards() { return this.formula()?.standards ?? []; }
  /** R20 parameters — cadences, caps, thresholds the row model could never express. */
  formulaParams() { return this.formula()?.params ?? []; }

  isCustomAsset() { return Number(this.registration()?.assetClass) === CLASS_CUSTOM; }
  isFrozen()      { return this.registration()?.compositionFrozen === true; }
  isDeclared()    { return Number(this.registration()?.declaration?.approvalState ?? 0) === 1; }

  /** May this operator change anything here at all — the gate every write control shares. */
  canWrite() { return this.isDeclared() && this.canManage && !this.isViewer() && this.entityActive; }

  /** Only rows that apply — 15 rows of mostly "Off" is noise, not information. */
  activeRequirements() {
    return (this.registration()?.requirements || []).filter((r: any) => Number(r.state) === 1 || Number(r.state) === 2);
  }

  /**
   * True when the definition asks for nothing beyond the baseline legal wrapper.
   *
   * ⚠️ The REASON changed at 4.9 even though the test did not, and the old reason is now
   * false: it said `AssetClassLib.defaultRequirement` makes row 1 Required for every class.
   * That function is DELETED, and with it every model default — so an almost-empty matrix is
   * no longer the model speaking, it is the REGULATOR's recorded position on this product.
   *
   * It still needs saying out loud, for a sharper reason than before: a nearly empty table
   * reads as broken, and here it may be entirely correct. The legal wrapper survives because
   * `approveAsset` enforces it independently (`legalWrapperDocumentId != 0`), not because any
   * matrix row says so.
   */
  onlyBaselineRequirement() {
    const rows = this.activeRequirements();
    return rows.length === 1 && Number(rows[0].requirementId) === REQ_LEGAL_WRAPPER;
  }

  /** True when the regulator set NO rows at all — a policy, not a missing answer. */
  noRequirements() { return this.activeRequirements().length === 0 && !!this.formula(); }

  /** Rows that IMPLY a party — the only ones the composition editor turns into a picker. */
  partyRequirements() { return (this.classCatalog()?.requirements || []).filter((r: any) => r.impliesParty); }
  /** Evidence-only rows (insurance, SPV, concentration limits, debtor verification). */
  evidenceRequirements() { return (this.classCatalog()?.requirements || []).filter((r: any) => !r.impliesParty); }

  isComposed(id: number) { return this.compositionDraft().includes(Number(id)); }
  toggleComposed(id: number) {
    if (this.isFrozen()) return;
    const n = Number(id);
    const cur = this.compositionDraft();
    this.compositionDraft.set(cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort((a, b) => a - b));
  }
  compositionDirty() {
    const a = [...this.compositionDraft()].sort((x, y) => x - y).join(',');
    const b = [...(this.registration()?.composition || [])].map(Number).sort((x, y) => x - y).join(',');
    return a !== b;
  }

  /** Roles the DRAFT implies, deduplicated — mirrors `assetRequiredRoles` rather than re-deriving. */
  draftRoles(): number[] {
    const cat = this.classCatalog()?.requirements || [];
    const seen = new Set<number>();
    for (const id of this.compositionDraft()) {
      const r = cat.find((x: any) => Number(x.id) === Number(id));
      if (r?.role) seen.add(Number(r.role));
    }
    return [...seen].sort((a, b) => a - b);
  }

  /** A role is satisfied when at least one ACCEPTED party fills it. */
  roleSatisfied(role: number) {
    return (this.registration()?.parties || []).some((p: any) => Number(p.role) === Number(role) && Number(p.state) === 2);
  }

  // ── the Status column ─────────────────────────────────────────────────────────
  /*
      The matrix's own `state` answers "is this demanded of me" (Required / Optional). It has
      never answered "have I done it", which is the question an operator actually brings to
      this table. So `state` is now labelled Obligation and this derives the missing half.

      It mirrors `approveAsset`'s three checks and claims NOTHING further: the profile, the
      wrapper's non-zero id, and `classPartiesSatisfied`. The remaining evidence rows
      (Insurance, SPV documentation, Concentration limits, Debtor verification) have no
      on-chain slot at all — the wrapper is the only evidence field that exists — so they are
      reported as held off-platform rather than given a tick this platform cannot support.
  */
  requirementStatus(r: any): StatusKind {
    if (Number(r.requirementId) === REQ_LEGAL_WRAPPER) {
      return this.registration()?.declaration?.legalWrapperDocumentId ? 'satisfied' : 'missing';
    }
    if (Number(r.role) > 0) {
      return this.roleSatisfied(Number(r.role)) ? 'satisfied' : 'missing';
    }
    return 'untracked';
  }

  /** Which sub-tab resolves a Missing row — nothing to offer for the other two kinds. */
  requirementFix(r: any): ComplianceRail | null {
    if (this.requirementStatus(r) !== 'missing') return null;
    return Number(r.requirementId) === REQ_LEGAL_WRAPPER ? 'declaration' : 'parties';
  }

  statusClass(kind: StatusKind): string {
    if (kind === 'satisfied') return 'bg-green-100 text-green-800';
    if (kind === 'missing')   return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-600';
  }

  // ── claim topic <-> bytes32 ───────────────────────────────────────────────────
  /*
      A claim topic IS the identity layer's key type: `bytes32(uint256(id))` over the
      `Claim Topic` Global Variables catalog (ITarmiizIdentity's TOPIC_* constants are exactly
      that). So the dropdown carries catalog ids and this pair does the only conversion.
  */
  private topicIdToBytes32(id: number): string {
    return '0x' + BigInt(id).toString(16).padStart(64, '0');
  }
  private bytes32ToTopicId(v: string | null | undefined): number {
    if (!v) return 0;
    try {
      const n = BigInt(v);
      // Catalog ids are small. Anything larger is a topic this dropdown cannot represent.
      return n > 0n && n <= 1000n ? Number(n) : 0;
    } catch { return 0; }
  }
  private isZeroBytes32(v: string | null | undefined): boolean {
    if (!v) return true;
    try { return BigInt(v) === 0n; } catch { return true; }
  }

  claimTopicName(id: number) {
    return this.claimTopics().find((t) => t.id === Number(id))?.name || String(id);
  }

  // ── jurisdictions ─────────────────────────────────────────────────────────────

  countryName(code: number) {
    return this.countries().find((c) => Number(c.countryCode) === Number(code))?.name || String(code);
  }
  addJurisdiction() {
    const code = Number(this.jurisdictionToAdd());
    if (!code) return;
    if (!this.jurisdictions().includes(code)) {
      this.jurisdictions.set([...this.jurisdictions(), code].sort((a, b) => a - b));
    }
    this.jurisdictionToAdd.set('');
  }
  removeJurisdiction(code: number) {
    this.jurisdictions.set(this.jurisdictions().filter((c) => c !== Number(code)));
  }

  // ── load ──────────────────────────────────────────────────────────────────────

  async load() {
    if (!this.address) return;
    this.registrationLoading.set(true);
    try {
      // Static reference data — fetched once and kept.
      if (!this.classCatalog()) {
        try { this.classCatalog.set(await this.apiService.assetClassCatalog()); } catch { /* labels degrade to ids */ }
      }
      if (!this.countries().length) await this.loadCountries();
      if (!this.claimTopics().length) await this.loadClaimTopics();

      const res = await this.apiService.assetClassInfo(this.address);
      this.registration.set(res || null);
      this.compositionDraft.set(((res?.composition || []) as any[]).map(Number));

      const p = res?.complianceProfile;
      const d = res?.declaration;

      const storedTopic = p?.requiredClaimTopic ?? '';
      const topicId = this.bytes32ToTopicId(storedTopic);
      this.unknownClaimTopic.set(!this.isZeroBytes32(storedTopic) && !topicId ? String(storedTopic) : '');

      this.declarationForm.set({
        holderCap: p?.holderCap ? String(p.holderCap) : '',
        minTicket: p?.minTicket && Number(p.minTicket) ? String(p.minTicket) : '',
        maxTicket: p?.maxTicket && Number(p.maxTicket) ? String(p.maxTicket) : '',
        lockupUntil: p?.lockupUntil ? new Date(Number(p.lockupUntil)).toISOString().slice(0, 10) : '',
        legalWrapperDocumentId: d?.legalWrapperDocumentId ? String(d.legalWrapperDocumentId) : '',
        requiredClaimTopic: topicId ? String(topicId) : '',
        requiredClaimLevel: p?.requiredClaimLevel ? String(p.requiredClaimLevel) : '',
      });
      this.jurisdictions.set(((p?.eligibleJurisdictions || []) as any[]).map(Number).filter((n) => n > 0));

      await this.resolveWrapperTitle();
      await this.loadDocRows();
    } catch {
      this.registration.set(null);
    } finally {
      this.registrationLoading.set(false);
    }
  }

  private async loadCountries() {
    try {
      const list = await this.apiService.vaultGetCountries();
      this.countries.set((list ?? [])
        .map((c: any) => ({
          countryCode: Number(c.country_code ?? c.countryCode),
          name: c.name_short ?? c.name_full ?? c.name ?? String(c.country_code ?? ''),
        }))
        .filter((c: any) => !!c.countryCode));
    } catch { this.countries.set([]); }
  }

  private async loadClaimTopics() {
    try {
      const list = await this.apiService.vaultGetGlobalVariablesByCategory('Claim Topic');
      this.claimTopics.set((list ?? []).map((v: any) => ({
        id: Number(v.variableId ?? v.variable_id),
        name: v.name,
      })).filter((t: any) => t.id > 0));
    } catch { this.claimTopics.set([]); }
  }

  /**
   * Turn the stored id into a document the operator recognises. Best-effort: a wrapper whose
   * title cannot be read still shows its id, which is what the field showed before.
   */
  private async resolveWrapperTitle() {
    const id = Number(this.registration()?.declaration?.legalWrapperDocumentId ?? 0);
    if (!id) { this.legalWrapperTitle.set(''); return; }
    try {
      const res: any = await this.apiService.assetDocumentGet(this.address, id);
      this.legalWrapperTitle.set(res?.document?.title ?? res?.title ?? '');
    } catch { this.legalWrapperTitle.set(''); }
  }


  // ── R16: document requirement rows and what is pinned against each ────────────────────────
  //
  // 🔴 WHY THIS EXISTS AT ALL. `approveAsset` hard-requires `classDocsSatisfied`, which is false
  // while any REQUIRED document row has no declared document. The regulator could already MAKE a
  // row Required — and a regulator-NAMED row is born Required — while nothing anywhere could
  // satisfy one. The asset became unapprovable with no path out. This rail is that path.
  //
  // ⚠️ TWO SOURCES, AND THE SECOND IS THE ONE THAT MATTERS. Catalog rows come from the resolved
  // matrix the page already loads and are usually UNSET under 4.9's blank sheet. The regulator's
  // own rows arrive only from this call, and they are ALWAYS Required. A rail showing only the
  // first would look complete and discharge nothing.
  docRows = signal<{ rowKey: string; label: string; description: string; required: boolean; documentId: number; title: string }[]>([]);
  docRowsLoading = signal(false);
  docRowSaving = signal<string | null>(null);

  /** Required rows still missing a document — what actually blocks approval. */
  docRowsOutstanding() { return this.docRows().filter(r => r.required && !r.documentId); }

  private async loadDocRows() {
    if (!this.address) { this.docRows.set([]); return; }
    this.docRowsLoading.set(true);
    try {
      const matrix = (this.registration()?.requirements || []) as any[];
      const res: any = await this.apiService.assetRequirementDocuments(
        this.address,
        // Ask about the catalog rows the REGULATOR set; the server adds its own named rows.
        matrix.filter(r => Number(r.state) === 1 || Number(r.state) === 2)
              .map(r => this.catalogRowKey(Number(r.requirementId))));
      const declared = new Map<string, number>(
        ((res?.documents || []) as any[]).map(d => [String(d.rowKey).toLowerCase(), Number(d.documentId)]));
      const docIds: number[] = res?.catalogDocIds || [];

      const rows: any[] = [];
      for (const r of matrix) {
        const id = Number(r.requirementId);
        if (!docIds.includes(id)) continue;                       // not a document-kind row
        if (Number(r.state) !== 1 && Number(r.state) !== 2) continue;  // Off / unset — not asked of us
        const key = this.catalogRowKey(id);
        rows.push({
          rowKey: key,
          label: this.requirementName(id),
          description: '',
          required: Number(r.state) === 1,
          documentId: declared.get(key.toLowerCase()) || 0,
          title: '',
        });
      }
      for (const c of ((res?.customRows || []) as any[])) {
        if (Number(c.state) === 3) continue;                      // Off — the regulator withdrew it
        rows.push({
          rowKey: String(c.rowKey),
          label: c.name,
          description: c.description || '',
          required: Number(c.state) === 1,
          documentId: declared.get(String(c.rowKey).toLowerCase()) || 0,
          title: '',
        });
      }
      this.docRows.set(rows);
      await this.resolveDocRowTitles();
    } catch {
      this.docRows.set([]);
    } finally {
      this.docRowsLoading.set(false);
    }
  }

  /** `AssetClassLib.catalogRowKey(n)` is simply `bytes32(n)` — left-padded hex, no hashing. */
  private catalogRowKey(id: number): string {
    return '0x' + id.toString(16).padStart(64, '0');
  }

  private requirementName(id: number): string {
    const cat = (this.classCatalog()?.requirements || []) as any[];
    return cat.find(r => Number(r.id) === id)?.name || `Requirement ${id}`;
  }

  /** Title per declared document, best-effort — an unreadable one still shows its id. */
  private async resolveDocRowTitles() {
    const rows = [...this.docRows()];
    for (const row of rows) {
      if (!row.documentId) continue;
      try {
        const res: any = await this.apiService.assetDocumentGet(this.address, row.documentId);
        row.title = res?.document?.title ?? res?.title ?? '';
      } catch { row.title = ''; }
    }
    this.docRows.set(rows);
  }

  /**
   * Pin an existing document against ONE row.
   *
   * ⚠️ A PICKER, NOT AN UPLOAD — the contract takes a `documentId` that must already exist, so
   * "point this row at a document" is the primitive. The picker offers upload only when
   * `manage-documents` is granted, exactly as the legal-wrapper control does; that is the
   * convenience layered on top, not a different operation.
   *
   * ⚠️ Re-pointing WORKS: the contract does a plain assignment, so a wrong choice is corrected by
   * attaching again. Only clearing is unavailable, because zero IS the absence on chain — which
   * is why there is no Remove control here and why the copy says "replace" rather than "edit".
   */
  async attachRowDocument(row: { rowKey: string; documentId: number }) {
    if (!this.canWrite()) return;
    const picked = await this.docPicker.show({
      resourceType: 'asset',
      address: this.address,
      canUpload: this.features.systemFunctionEnabled('manage-documents'),
      selectedId: row.documentId || null,
    });
    if (!picked) return;

    this.docRowSaving.set(row.rowKey);
    // ⚠️ HIDE BEFORE EVERY ALERT, not only in the finally. The overlay mounts ON TOP of the
    // dialog, so an alert raised while it is up cannot be dismissed and the awaited promise
    // never settles — the app freezes with no error. `hide()` is an idempotent signal set, so
    // the finally stays as the backstop rather than being replaced by it. Matches
    // `saveDeclaration` below, and `scripts/check-loader-deadlock.js` enforces it.
    this.loadingService.show(this.translate.instant('common.processing'));
    try {
      const res: any = await this.apiService.assetDeclareRequirementDocument(
        this.address, row.rowKey, Number(picked.documentId));
      if (res?.error) {
        this.loadingService.hide();
        this._alert('assets.details.compliance.failedTitle', res.error);
        return;
      }
      await this.loadDocRows();
      await this.load();          // classDocsSatisfied may have flipped — refresh the readiness panel
      this.loadingService.hide();
    } catch (e: any) {
      this.loadingService.hide();
      this._alert('assets.details.compliance.failedTitle', e?.error?.error || e?.message || '');
    } finally {
      this.loadingService.hide();
      this.docRowSaving.set(null);
    }
  }

  private _alert(titleKey: string, msg: string) {
    this.alertService.info(this.translate.instant(titleKey), msg, this.translate.instant('common.close'), 'max-w-md');
  }

  // ── writes ────────────────────────────────────────────────────────────────────

  async chooseWrapper() {
    if (!this.canWrite()) return;
    const current = Number(this.declarationForm().legalWrapperDocumentId || 0);
    const picked = await this.docPicker.show({
      resourceType: 'asset',
      address: this.address,
      canUpload: this.features.systemFunctionEnabled('manage-documents'),
      selectedId: current || null,
    });
    if (!picked) return;
    this.declarationForm.set({ ...this.declarationForm(), legalWrapperDocumentId: String(picked.documentId) });
    this.legalWrapperTitle.set(picked.title);
  }

  async saveComposition() {
    if (!this.address || this.isFrozen()) return;
    this.compositionSaving.set(true);
    this.loadingService.show(this.translate.instant('common.processing'));
    try {
      const res: any = await this.apiService.assetSetComposition(this.address, this.compositionDraft());
      this.loadingService.hide();
      if (res?.error) { this._alert('assets.details.compliance.failedTitle', res.error); return; }
      await this.load();
      this._alert('assets.details.compliance.savedTitle', this.translate.instant('assets.details.compliance.savedMsg'));
    } catch (e: any) {
      this.loadingService.hide();
      this._alert('assets.details.compliance.failedTitle', e?.error?.error || e?.message || '');
    } finally {
      this.loadingService.hide();
      this.compositionSaving.set(false);
    }
  }

  async saveDeclaration() {
    if (!this.address) return;
    const f = this.declarationForm();

    // The contract requires a level with a topic; saying so here names the field instead of
    // letting the API's 400 arrive as an anonymous failure.
    const topicId = Number(f.requiredClaimTopic || 0);
    const level = Number(f.requiredClaimLevel || 0);
    const hasTopic = topicId > 0 || !!this.unknownClaimTopic();
    if (hasTopic && level <= 0) {
      this._alert('assets.details.compliance.failedTitle',
        this.translate.instant('assets.details.compliance.claimLevelRequired'));
      return;
    }

    // ⚠️ ALWAYS send the profile. This used to be `if (holderCap || minTicket || maxTicket ||
    // lockupUntil)` — "send it whenever any field is filled" — which made the MOST COMMON valid
    // profile impossible to declare: all-zero means unlimited holders, no ticket bounds and no
    // lock-up, i.e. an ordinary open-ended fund. An issuer who wanted no restrictions could never
    // clear the "compliance profile is declared" check, so `approveAsset` reverted on
    // `_profile[asset].set` forever and the asset could never trade. "No restrictions" is a
    // DECISION, not an absence of one — and the contract already agrees: `set: true` is forced
    // server-side, and 0 is documented as unlimited/none on every field.
    //
    // Unconditional is safe because `load()` populates this form FROM the stored profile, so a
    // save that only edits the legal wrapper re-sends the values already on chain rather than
    // zeroing them. (Re-declaring is allowed only while approvalState is 1; the contract refuses
    // it afterwards, which is what stops a post-approval rewrite.)
    const body: any = {
      complianceProfile: {
        holderCap: Number(f.holderCap || 0),
        minTicket: f.minTicket || '0',
        maxTicket: f.maxTicket || '0',
        // MILLISECONDS out — the API divides to seconds for the chain.
        lockupUntil: f.lockupUntil ? new Date(f.lockupUntil + 'T00:00:00Z').getTime() : 0,
        eligibleJurisdictions: this.jurisdictions(),
        // A topic the dropdown could not represent is carried through VERBATIM. Mapping it to
        // "none" would clear a live restriction on the next unrelated save.
        requiredClaimTopic: this.unknownClaimTopic() || (topicId ? this.topicIdToBytes32(topicId) : undefined),
        requiredClaimLevel: hasTopic ? level : 0,
      },
    };
    if (!body.complianceProfile.requiredClaimTopic) delete body.complianceProfile.requiredClaimTopic;
    if (f.legalWrapperDocumentId) body.legalWrapperDocumentId = Number(f.legalWrapperDocumentId);

    this.loadingService.show(this.translate.instant('common.processing'));
    try {
      const res: any = await this.apiService.assetSetDeclaration(this.address, body);
      this.loadingService.hide();
      if (res?.error) { this._alert('assets.details.compliance.failedTitle', res.error); return; }
      await this.load();
      this._alert('assets.details.compliance.savedTitle',
        this.translate.instant('assets.details.compliance.declarationSavedMsg'));
    } catch (e: any) {
      this.loadingService.hide();
      this._alert('assets.details.compliance.failedTitle', e?.error?.error || e?.message || '');
    }
  }

  /** Roles this asset can be given a party for — the catalog, not just the required set. */
  attachableRoles() { return this.classCatalog()?.roles || []; }

  async attachParty(role: number) {
    if (!this.address || !role) return;
    const picked = await this.partyPicker.show({ role: Number(role), roleName: this.roleName(role) });
    if (!picked) return;

    this.loadingService.show(this.translate.instant('common.processing'));
    try {
      const res: any = await this.apiService.assetPartyAttach(this.address, picked.address, Number(role));
      this.loadingService.hide();
      if (res?.error) { this._alert('assets.details.compliance.failedTitle', res.error); return; }
      await this.load();
      // The party must now ACCEPT for itself — say so, or the issuer waits for nothing.
      this._alert('assets.details.compliance.savedTitle',
        this.translate.instant('assets.details.compliance.partyProposedMsg'));
    } catch (e: any) {
      this.loadingService.hide();
      this._alert('assets.details.compliance.failedTitle', e?.error?.error || e?.message || '');
    }
  }

  async removeParty(party: string) {
    if (!this.address) return;
    const ok = await this.alertService.show(
      this.translate.instant('assets.details.compliance.removePartyTitle'),
      this.translate.instant('assets.details.compliance.removePartyConfirm'),
      this.translate.instant('common.remove'),
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('common.processing'));
    try {
      const res: any = await this.apiService.assetPartyRemove(this.address, party);
      this.loadingService.hide();
      if (res?.error) { this._alert('assets.details.compliance.failedTitle', res.error); return; }
      await this.load();
    } catch (e: any) {
      this.loadingService.hide();
      this._alert('assets.details.compliance.failedTitle', e?.error?.error || e?.message || '');
    }
  }
}
