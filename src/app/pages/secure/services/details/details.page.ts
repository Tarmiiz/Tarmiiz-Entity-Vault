import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { Subscription as RxSubscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { PARTY_CLASS, partyClassName } from '../../../../shared/constants/party-class';
import { ApiService } from '../../../../shared/services/api.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { Asset, AssetTransaction, ContactInfo, Service, Subscription, User } from '../../../../shared/models/data.model';
import { AuthService } from '../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { applyPdfFooter } from '../../../../shared/utils/pdf-export.utils';
import { ModalServiceStateService } from '../modals/modal-service-state/modal-service-state.service';
import { ModalServiceStateComponent } from "../modals/modal-service-state/modal-service-state.component";
import { ModalServiceEditService } from '../modals/modal-service-edit/modal-service-edit.service';
import { ModalServiceEditComponent } from "../modals/modal-service-edit/modal-service-edit.component";
import { ModalTransactionInfoService } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.component';
import { ModalServiceValidatorService } from '../modals/modal-service-validator/modal-service-validator.service';
import { ModalServiceValidatorComponent } from '../modals/modal-service-validator/modal-service-validator.component';
import { ModalServicePaymentProcessorService } from '../modals/modal-service-payment-processor/modal-service-payment-processor.service';
import { ModalServicePaymentProcessorComponent } from '../modals/modal-service-payment-processor/modal-service-payment-processor.component';
import { ModalServiceClearingHouseService } from '../modals/modal-service-clearing-house/modal-service-clearing-house.service';
import { ModalServiceClearingHouseComponent } from '../modals/modal-service-clearing-house/modal-service-clearing-house.component';
import { ModalServiceCustodianService, SELF_CUSTODY_SENTINEL } from '../modals/modal-service-custodian/modal-service-custodian.service';
import { ModalServiceCustodianComponent } from '../modals/modal-service-custodian/modal-service-custodian.component';
import { ModalServiceFeeConfigService } from '../modals/modal-service-fee-config/modal-service-fee-config.service';
import { ModalServiceFeeConfigComponent } from '../modals/modal-service-fee-config/modal-service-fee-config.component';
// Opened in 'switch' mode ONLY. Its 'declare' mode is unreachable from here by design — the
// regulator declares a service's initial election (see the authority-model note on getElections).
import { ModalServiceElectionService, payRoleForElection } from '../modals/modal-service-election/modal-service-election.service';
import { ModalServiceElectionComponent } from '../modals/modal-service-election/modal-service-election.component';
import { MetadataEditModalService } from '../../../../shared/components/metadata-edit-modal/metadata-edit-modal.service';
import { MetadataEditModalComponent } from '../../../../shared/components/metadata-edit-modal/metadata-edit-modal.component';
import { SocketService } from '../../../../shared/services/socket.service';
import { AuditService } from '../../../../shared/services/audit.service';
import { DocumentsTabComponent } from '../../../../shared/components/documents-tab/documents-tab.component';
import { LiveIndicatorComponent } from '../../../../shared/components/live-indicator/live-indicator.component';
import { ModalImageAddService } from '../../../../shared/components/modal-image-add/modal-image-add.service';
import { ModalImageAddComponent } from '../../../../shared/components/modal-image-add/modal-image-add.component';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { RefreshButtonComponent } from '../../../../shared/components/refresh-button/refresh-button.component';
import { PaginatorComponent, pageSlice } from '../../../../shared/components/paginator/paginator.component';
import { ServiceLicense, licenseMeaning, licenseStateClass, licenseStateName } from '../../../../shared/utils/license.utils';

// Entry inside a metadata `media` key (server-owned public docs/images index).
/**
 * One Phase 17 FUNCTION GRANT row, as `GET /services/:address/grants` returns it.
 *
 * ⚠️ `source` carries THREE refusals that look identical in a boolean and are not:
 *   `explicit` a regulator set this cell · `default` nobody has decided, so default-deny refuses
 *   · `stale` a regulator DID decide and a later `grantInvalidateAll()` voided it.
 * `granted` is the only thing that decides capability; `source` is why.
 */
export interface ServiceGrant {
  key: string;
  group: string;
  subject: string;
  maxLevel: number;
  /** EPOCH-CHECKED and already unwrapped by the sync plugin. Never re-decode it. */
  level: number;
  granted: boolean;
  source: 'explicit' | 'default' | 'stale';
  setBy: string;
  updatedAt: number;
}

export interface MediaEntry { documentId: number; cid: string; title: string; fileType: string; }
export interface MediaIndex {
  avatar?: MediaEntry;
  banner?: MediaEntry;
  images?: MediaEntry[];
  documents?: MediaEntry[];
}


@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [RefreshButtonComponent, 
    CommonModule, FormsModule,
    HeaderComponent,
    RouterLink,
    ModalServiceEditComponent,
    ModalServiceStateComponent,
    ModalTransactionInfoComponent,
    ModalServiceValidatorComponent,
    ModalServicePaymentProcessorComponent,
    ModalServiceClearingHouseComponent,
    ModalServiceCustodianComponent,
    ModalServiceFeeConfigComponent,
    ModalServiceElectionComponent,
    MetadataEditModalComponent,
    DocumentsTabComponent,
    ModalImageAddComponent,
    LiveIndicatorComponent, TranslatePipe, MoneyPipe,
    PaginatorComponent,
  ]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  utils = inject(UtilsService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private serviceEditService = inject(ModalServiceEditService);
  private serviceStateService = inject(ModalServiceStateService);
  trxInfoService = inject(ModalTransactionInfoService);
  private validatorModalService = inject(ModalServiceValidatorService);
  private paymentProcessorModalService = inject(ModalServicePaymentProcessorService);
  private clearingHouseModalService = inject(ModalServiceClearingHouseService);
  private custodianModalService = inject(ModalServiceCustodianService);
  private feeConfigModal = inject(ModalServiceFeeConfigService);
  private electionModalService = inject(ModalServiceElectionService);
  private metadataEditModal = inject(MetadataEditModalService);
  private imageAddModal = inject(ModalImageAddService);
  private socketService = inject(SocketService);
  private authService = inject(AuthService);
  private auditService = inject(AuditService);
  features = inject(FeaturesService);
  private translate = inject(TranslateService);

  get isServiceProvider() { return this.features.isServiceProvider(); }

  userInfo!: User;
  get entityActive() { return this.authService.entityActive(); }
  private _socketSub: RxSubscription | null = null;

  activeTab = signal<'overview' | 'info' | 'licenses' | 'providers' | 'election' | 'metadata' | 'assets' | 'subscriptions' | 'trxs' | 'liquidity' | 'docs'>('overview');

  // ── the onc/offc election (S5, S63-S68) ─────────────────────────────────────────────
  // A LIST, not a field: the election is per CURRENCY, so a service may be onc in one and
  // offc in another. Every payment leg reads it LIVE (S11) — this mirror is for display.
  elections = signal<any[]>([]);
  paymentProviders = signal<any[]>([]);
  electionsLoading = signal(false);
  migratingCcy = signal<number | null>(null);

  // Public-profile metadata parsed from the service's on-chain metadata JSON string.
  // `contact` is rendered in its own Contact section; `entries` are the free-form
  // additional fields (reserved keys excluded), shown in the Metadata tab's KV table.
  parsedMetadata = computed<{ description: string; contact: ContactInfo; entries: [string, string][]; raw: string; valid: boolean }>(() => {
    const raw = this.service()?.metadata ?? '';
    const emptyContact: ContactInfo = { email: '', phone: '', website: '', address: '' };
    if (!raw) return { description: '', contact: emptyContact, entries: [], raw: '', valid: true };
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const description = typeof obj.description === 'string' ? obj.description : '';
        const c = (obj.contact && typeof obj.contact === 'object' && !Array.isArray(obj.contact)) ? obj.contact : {};
        const contact: ContactInfo = {
          email:   c.email   ?? obj.email    ?? '',
          phone:   c.phone   ?? obj.telephone ?? obj.mobile ?? '',
          website: c.website ?? obj.website  ?? '',
          address: c.address ?? obj.address  ?? '',
        };
        // `media` is the server-owned public images index (rendered by the Images
        // section); excluded from the KV table like `description` / `contact`.
        const RESERVED = new Set(['description', 'media', 'contact', 'email', 'telephone', 'mobile', 'website', 'address']);
        const entries = Object.entries(obj)
          .filter(([k]) => !RESERVED.has(k))
          .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string])
          .sort((a, b) => a[0].localeCompare(b[0]));
        return { description, contact, entries, raw: typeof raw === 'string' ? raw : JSON.stringify(raw), valid: true };
      }
    } catch (_) { /* fall through */ }
    return { description: '', contact: emptyContact, entries: [], raw: typeof raw === 'string' ? raw : JSON.stringify(raw), valid: false };
  });

  hasContact = computed(() => {
    const c = this.parsedMetadata().contact;
    return !!(c.email || c.phone || c.website || c.address);
  });

  liquidityBalances = signal<{ currencyCode: number; currencyName: string; currencySymbol: string; currencyAlpha?: string; balance: number; withheld: number; available: number; obligation: number; shortfall: number; coverageRatio: number | null }[]>([]);

  // Regulator-set minimum shortfall that raises an alert (currency units). isSet=false ⇒ the
  // platform default floor applies. A shortfall at or below it is real but not alertable, so the
  // threshold has to be visible next to the numbers.
  shortfallTolerance      = signal<number | null>(null);
  shortfallToleranceIsSet = signal(false);

  withinShortfallTolerance(shortfall: number): boolean {
    const tol = this.shortfallTolerance();
    return shortfall > 0 && tol !== null && shortfall <= tol;
  }

  // How far the shortfall still is from the alert threshold, formatted for display.
  toleranceHeadroom(shortfall: number): string {
    const tol = this.shortfallTolerance();
    if (tol === null) return '';
    const gap = Math.max(0, tol - shortfall);
    return gap >= 0.01 ? gap.toFixed(2) : String(Math.round(gap * 1e6) / 1e6);
  }

  // Coverage must never ROUND UP to 100% while the obligation is not actually covered —
  // 99.9766% displayed as "100.0%" is what made a real 1.08 shortfall look like none.
  // Floor to the one decimal we render, so only a true ratio >= 1 shows 100.0%.
  coveragePercent(ratio: number | null | undefined): number | null {
    if (ratio === null || ratio === undefined) return null;
    const pct = ratio * 100;
    return pct >= 100 ? 100 : Math.floor(pct * 10) / 10;
  }

  liquidityCoverageTone(ratio: number | null | undefined): 'good' | 'warn' | 'bad' | 'idle' {
    if (ratio === null || ratio === undefined) return 'idle';
    if (ratio >= 1) return 'good';
    if (ratio >= 0.5) return 'warn';
    return 'bad';
  }
  liquidityLoading = signal(false);
  // Liquidity change history (plugin-mirrored credit ledger, origin 3=inject / 4=withdraw).
  liquidityHistory = signal<any[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  liqHistoryPage = signal(1);
  liqHistoryPageSize = signal(25);
  pagedLiqHistory = computed(() => pageSlice(this.liquidityHistory(), this.liqHistoryPage(), this.liqHistoryPageSize()));
  liquidityHistoryLoading = signal(false);
  private readonly creditOriginNames: Record<number, string> = {
    1: 'Deposit', 2: 'Withdraw', 3: 'Liquidity Inject', 4: 'Liquidity Withdraw',
    5: 'Service Send', 6: 'Withhold', 7: 'Settle', 8: 'Cross-Service Settle',
    9: 'Peer-to-Peer', 10: 'Regulator Transfer', 11: 'Settle Fee',
    12: 'Cross-Service Settle Fee', 13: 'Bank Transfer', 14: 'Route Transfer',
  };
  creditOriginLabel(o: number): string { return this.creditOriginNames[o] ?? ('Origin ' + o); }
  // credit_transactions.trx_amount arrives in whole-currency units since the
  // 2026-07-30 money-unit unification (the mirror divides once, exactly, at the
  // plugin write boundary) — dividing again here would render every amount as 0.
  formatCreditAmount(v: any): string {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 6 }) : '0';
  }
  liquidityModalOpen = signal(false);
  liquidityModalAction = signal<'inject' | 'withdraw'>('inject');
  liquidityModalCurrency = signal<{ code: number; name: string; symbol: string } | null>(null);
  liquidityModalAvailable = signal<number>(0);
  liquidityModalAmount = signal<string>('');
  liquidityModalRefNo = signal<string>('');
  liquidityModalSubmitting = signal(false);
  liquidityModalError = signal<string>('');

  loadingData: boolean = false;
  refreshing = signal(false);

  serviceAddress = '';
  service = signal<Service | undefined>(undefined);
  withheldCredit  = signal<{ currencyCode: number; currencyName: string; currencySymbol: string; withheld: number }[]>([]);
  withheldAssets  = signal<{ asset: string; name: string; symbol: string; totalWithheld: number }[]>([]);
  // ── LICENSES replace the type/sub-type pair (Phase 28 step (e), 2026-09-03) ────────────────
  //
  // 🔴 `isTokenProvider` GATES UI SECTIONS — it is not a label — so its correctness matters more
  // than the two displays below it. It now asks whether the service holds an ACTIVE Token Issuer
  // LICENSE (class 27), which is strictly stronger than `serviceType === 1`: that was a byte the
  // ENTITY set at creation, whereas a license is Active only because a regulator approved it and
  // stops being Active the moment one suspends it.
  //
  // ⚠️ IT IS FALSE ON EVERY ROW UNTIL THE LICENSE READ ROUTE LANDS, because `Service.licenses` is
  // populated by nothing yet — the Entity API has the chain helpers (`serviceHasLicense`,
  // `serviceLicensesOf`) but no route exposing them. That is a KNOWN, NAMED gap owned by the
  // licensing lane, and it fails CLOSED: issuer sections stay hidden rather than being shown for
  // a service whose license nobody checked. Do NOT paper over it by defaulting to true, and do
  // NOT infer it from another field — a wrongly-shown issuer surface is the failure this whole
  // phase exists to make impossible.
  /*
      🔴 THE PRIVATE 3-ENTRY NAME MAP IS GONE, AND THE FIELD IT READ WAS NEVER POPULATED.

      `service.licenses` had no producer — the Vault's ApiService carried no licence method at all —
      so it was permanently `[]`, `isTokenProvider()` was permanently FALSE (8 template branches),
      and the Licences box rendered "—" in two places. That is exactly what the user reported as
      "on the entity side, the granted license is not reflected". Identical defect to the Regulator
      Dashboard's, in the same shape, in the second app; and the API to fix it existed all along.

      Names now come from the on-chain `License Class` catalog (29 values) at runtime, so a class
      appended on a live chain needs no rebuild — and nothing outside the market family renders as
      `Class 14` any more.
  */
  licenses          = signal<ServiceLicense[]>([]);
  licensesLoading   = signal(false);

  /*
      ── PHASE 17 FUNCTION GRANTS (read only) ────────────────────────────────────────────────
      A licence says what MARKET this service may operate in; a grant says which individual
      FUNCTIONS its regulator permits. Same question at two granularities, which is why they share
      a tab.

      🔴 NO WRITE PATH, EVER. A grant is the regulator's act. There is no setter on the Entity API
      and there must be no control here — a button the entity cannot use implies a power it does
      not have, which is worse than showing nothing.
  */
  grants          = signal<ServiceGrant[]>([]);
  grantsLoading   = signal(false);
  /* Cells the MIRROR holds. Zero on a live service is a SYNC failure, not a default-deny, and
     the two are indistinguishable from the rows alone — so it is rendered as its own message. */
  grantsMirrored  = signal<number | null>(null);
  grantsLoaded    = signal(false);

  /** The catalog groups present, in catalog order, so the card renders one block per family. */
  grantGroups = computed(() => [...new Set(this.grants().map((g) => g.group))]);
  grantsIn = (group: string) => this.grants().filter((g) => g.group === group);
  licenseClassNames = signal<Record<number, string>>({});

  licenseClassName  = (id: number) => this.licenseClassNames()[Number(id)] || `Class ${id}`;
  licenseStateName  = licenseStateName;
  licenseStateClass = licenseStateClass;
  licenseMeaning    = licenseMeaning;

  // 27 = Token Issuer, named once. `service.licenses` holds the ACTIVE set only (see `loadLicenses`)
  // because a Suspended licence permits nothing — so a service holding a suspended token-issuer
  // licence is correctly NOT a token provider for the purposes of this page.
  private static readonly CLASS_TOKEN_ISSUER = 27;
  isTokenProvider = computed(() =>
    (this.service()?.licenses ?? []).includes(DetailsPage.CLASS_TOKEN_ISSUER));
  serviceTypeDisplay = computed(() => {
    const ids = this.service()?.licenses ?? [];
    if (!ids.length) return '—';
    return ids.map((i: number) => this.licenseClassName(i)).join(', ');
  });
  // ⚠️ NO SUCCESSOR to the confirmed / awaiting-confirmation pill, deliberately. A license has no
  // separate confirmation to display: it is Active BECAUSE a regulator approved it. Rendering
  // "awaiting confirmation" would invent a state the ledger does not have.
  suspensionReason = signal<string>('');
  validatorName = signal<string>('');
  paymentProcessorName = signal<string>('');
  custodianName = signal<string>('');
  // 1:N provider attachments for this service (validators / payment processors / custodians).
  // `name` is resolved lazily from the regulator-scoped registries (resolvePartyNames).
  // FIVE buckets — the API's `listServiceParties` returns escrowClearingHouses as its own,
  // deliberately NOT merged into clearingHouses: a venue's escrow CH is a SEPARATE
  // appointment from the entities' CH. Declaring four here is why those attachments
  // existed on chain and rendered nowhere.
  serviceParties = signal<{ validators: { address: string; active: boolean; name?: string }[]; paymentProcessors: { address: string; active: boolean; name?: string }[]; custodians: { address: string; active: boolean; name?: string }[]; clearingHouses: { address: string; active: boolean; name?: string }[]; escrowClearingHouses: { address: string; active: boolean; name?: string }[] }>({ validators: [], paymentProcessors: [], custodians: [], clearingHouses: [], escrowClearingHouses: [] });

  // Flattened view of the four 1:N attachment sets for the Service Providers tab's single table.
  // `partyType` is the SHARED platform numbering — the same ids the Add modal's spType uses
  // and the same ids ServicePartiesLib uses on chain. ⚠️ NEVER write the digit here: the
  // catalog renumbered (Bank inserted at 3, Custodian 3 -> 4, Clearing House 4 -> 5) and the
  // old values are all still VALID, so a stale literal silently names a different family
  // rather than failing. It is also APPEND-ONLY on chain, so `1..N` is not a closed range.
  // `removable` encodes the on-chain rule that a service must keep at least one custodian — a
  // clearing house has no such floor, because an EMPTY set is itself meaningful ("this market's
  // credit is final, settle every fill immediately").
  allServiceParties = computed<{ partyType: number; typeLabelKey: string; address: string; name: string; active: boolean; selfCustody: boolean; removable: boolean }[]>(() => {
    const p = this.serviceParties();
    const row = (partyType: number, typeLabelKey: string, x: { address: string; active: boolean; name?: string }, removable: boolean) => ({
      partyType, typeLabelKey, address: x.address, name: x.name ?? '', active: x.active,
      selfCustody: partyType === PARTY_CLASS.CUSTODIAN && this.isSelfCustodyAddress(x.address),
      removable,
    });
    return [
      ...p.validators.map(v => row(PARTY_CLASS.VALIDATOR, 'services.details.info.partyLabelValidator', v, true)),
      // The API merges BOTH rail classes (gateway 2 + bank 3) into this bucket, so the id is
      // the gateway's. It labels the ROLE, not the rail type — the per-currency attachment
      // carries the rail, and every consumer here asks one question: who processes payments.
      ...p.paymentProcessors.map(v => row(PARTY_CLASS.PAYMENT_GATEWAY, 'services.details.info.partyLabelPaymentProcessor', v, true)),
      ...p.custodians.map(v => row(PARTY_CLASS.CUSTODIAN, 'services.details.info.partyLabelCustodian', v, p.custodians.length > 1)),
      ...p.clearingHouses.map(v => row(PARTY_CLASS.CLEARING_HOUSE, 'services.details.info.partyLabelClearingHouse', v, true)),
      ...(p.escrowClearingHouses ?? []).map(v => row(PARTY_CLASS.ESCROW_CH, 'services.details.info.partyLabelEscrowClearingHouse', v, true)),
    ];
  });

  // providers tab filter
  filterPartyType = signal<string>('');
  /** 1-based, per frontend Standard 1.5. */
  servicePartiesPage = signal(1);
  servicePartiesPageSize = signal(25);
  pagedServiceParties = computed(() => pageSlice(this.filteredServiceParties(), this.servicePartiesPage(), this.servicePartiesPageSize()));
  filteredServiceParties = computed(() => {
    const t = this.filterPartyType();
    return t ? this.allServiceParties().filter(p => String(p.partyType) === t) : this.allServiceParties();
  });
  clearPartyFilters() { this.filterPartyType.set(''); }
  subscriptions = signal<Subscription[]>([]);
  assets = signal<Asset[]>([]);
  transactions = signal<AssetTransaction[]>([]);
  trxPage = signal(1);
  trxPageSize = signal(25);

  // assets tab filter + pagination
  filterAssetName = signal<string>('');
  filterAssetState = signal<string>('');
  assetPage = signal(1);
  assetPageSize = signal(25);
  uniqueAssetStates = computed(() =>
    [...new Set(this.assets().map(a => a.stateName).filter(Boolean))].sort()
  );
  filteredAssets = computed(() => {
    const name = this.filterAssetName().toLowerCase().trim();
    const state = this.filterAssetState();
    return this.assets().filter(a =>
      (!name || a.name.toLowerCase().includes(name) || a.symbol.toLowerCase().includes(name)) &&
      (!state || a.stateName === state)
    );
  });
  pagedAssets = computed(() => pageSlice(this.filteredAssets(), this.assetPage(), this.assetPageSize()));

  // subscriptions tab filter + pagination
  filterSubAddress = signal<string>('');
  filterSubState = signal<string>('');
  subPage = signal(1);
  subPageSize = signal(25);
  uniqueSubStates = computed(() =>
    [...new Set(this.subscriptions().map(s => s.stateName).filter(Boolean))].sort()
  );
  filteredSubscriptions = computed(() => {
    const addr = this.filterSubAddress().toLowerCase().trim();
    const state = this.filterSubState();
    return this.subscriptions().filter(s =>
      (!addr || s.subscription.toLowerCase().includes(addr)) &&
      (!state || s.stateName === state)
    );
  });
  pagedSubscriptions = computed(() => pageSlice(this.filteredSubscriptions(), this.subPage(), this.subPageSize()));

  filterTrxType = signal<string>('');
  filterTrxAsset = signal<string>('');
  filterTrxSubscription = signal<string>('');
  filterTrxStartDate = signal<string>('');
  filterTrxEndDate = signal<string>('');
  filterTrxCurrency = signal<string>('');

  uniqueTrxAssets = computed(() =>
    [...new Map(this.transactions().map(t => [t.asset, `${t.assetName} (${t.assetSymbol})`])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  uniqueTrxSubscriptions = computed(() =>
    [...new Set(this.transactions().filter(t => t.subscription).map(t => t.subscription))].sort()
  );

  uniqueTrxCurrencies = computed(() =>
    [...new Set(this.transactions().map(t => t.currencyCode).filter(Boolean))].sort()
  );

  filteredTrxs = computed(() => {
    const type = this.filterTrxType();
    const asset = this.filterTrxAsset();
    const sub = this.filterTrxSubscription();
    const currency = this.filterTrxCurrency();
    const startTs = this.filterTrxStartDate() ? Math.floor(new Date(this.filterTrxStartDate()).getTime() / 1000) : 0;
    const endTs   = this.filterTrxEndDate()   ? Math.floor(new Date(this.filterTrxEndDate()).getTime()   / 1000) + 86399 : Infinity;
    return this.transactions().filter(t =>
      (!type || t.trxType === type) &&
      (!asset || t.asset === asset) &&
      (!sub || t.subscription === sub) &&
      (!currency || t.currencyCode === currency) &&
      t.time >= startTs && t.time <= endTs
    );
  });

  pagedTransactions = computed(() => pageSlice(this.filteredTrxs(), this.trxPage(), this.trxPageSize()));

  // overview computed signals
  subscribeCount = computed(() => this.transactions().filter(t => t.trxType === 'Subscribe').length);
  redeemCount = computed(() => this.transactions().filter(t => t.trxType === 'Redeem').length);
  lastTrx = computed(() => {
    const t = this.transactions();
    if (!t || t.length === 0) return null;
    return [...t].sort((a, b) => b.time - a.time)[0];
  });

  constructor() { 
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.serviceAddress = address;
    }    
  }

  // The license CATALOG is jurisdiction-wide vocabulary, not per-service data — fetched once here
  // rather than inside `getServiceDetails`, which runs again on every tab switch and refresh.
  async ngOnInit() { await this.loadLicenseClasses(); }

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    // ⚠️ 'election' belongs in BOTH the cast and the allow-list. A tab missing from either is
    // silently rewritten to Overview, so `?tab=election` did not survive a refresh — and the
    // election is exactly the surface an operator deep-links to while chasing a regulator's
    // declaration or a pending switch.
    const requested = this.route.snapshot.queryParamMap.get('tab') as
      ('overview' | 'info' | 'providers' | 'election' | 'metadata' | 'assets' | 'subscriptions' | 'trxs' | 'liquidity' | 'docs' | null);
    const allowed = ['overview', 'info', 'providers', 'election', 'metadata', 'assets', 'subscriptions', 'trxs', 'liquidity', 'docs'] as const;
    let initialTab = requested && (allowed as readonly string[]).includes(requested) ? requested : 'overview';
    // Overview is hidden for service-provider tenants — fall back to Information.
    if (this.isServiceProvider && initialTab === 'overview') initialTab = 'info';
    this.activeTab.set(initialTab);
    await this.reload();
    if (initialTab === 'liquidity') this.getLiquidity();
    // `setTab` is what normally loads the election rows; a deep link bypasses it.
    if (initialTab === 'election') this.getElections();
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.reload(true));
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
    this.revokeMediaImageUrls();
  }

  private async reload(silent = false) {
    if (silent) this.refreshing.set(true);
    try {
      await this.getServiceDetails(silent);
      await Promise.all([
        this.getAssets(silent),
        this.getSubscriptions(silent),
        this.getTransactions(1, 500, silent),
      ]);
    } finally {
      if (silent) this.refreshing.set(false);
    }
  }

  // ── The onc/offc election (S5, S63-S68) ─────────────────────────────────────────────────
  //
  // Whether this service's money is `onc` (fiat already in reserve, so a movement is final) or
  // `offc` (credit records the movement and fiat settles behind it). DECLARED, never inferred
  // from the attachments (S63) — attachment validates AGAINST it (S6).
  //
  // ⚠️ AUTHORITY MODEL — the REGULATOR declares, the entity only requests changes:
  //   • the REGULATOR declares a service's initial election, PER CURRENCY, per service
  //     (`P_ELECTION_DECLARE` is gated `K_REGULATOR_OF`) — so this page has NO declare action,
  //   • the ENTITY may REQUEST a switch and the REGULATOR approves it, in both directions,
  //   • anyone may drive the paged migration (`P_ELECTION_MIGRATE` is `K_OPEN`).
  //
  // This used to let the entity declare. `onc` means the service MINTS credit against fiat it
  // claims to hold in reserve, and under the old rule the regulator approved every LATER switch
  // but never the STARTING position — so a service that declared onc on day one passed through
  // no approval at all. The regulator can now also allow one service to run onc and refuse
  // another. Do not reintroduce a declare button here; the call is refused on chain.
  //
  // The entity CAN still withdraw its own pending request, because approval freezes the currency
  // and a stale request is a hazard rather than clutter.

  async getElections() {
    const address = this.service()?.address;
    if (!address) return;
    this.electionsLoading.set(true);
    try {
      const [el, pp] = await Promise.all([
        this.apiService.vaultServiceElection(address),
        this.apiService.vaultServicePaymentProviders(address),
      ]);
      this.elections.set(el?.elections || []);
      this.paymentProviders.set(pp?.providers || []);
    } catch {
      this.elections.set([]);
      this.paymentProviders.set([]);
    } finally {
      this.electionsLoading.set(false);
    }
  }

  // WHO made the last election transition, of ANY kind. The API derives the kind by comparing the
  // announced actor against this service's entity and regulator; 'unknown' means the row predates
  // the field and must render as neither.
  //
  // ⚠️ This is NOT the field to render a verdict from — use `clearedByKind` below. Kept because it
  // is still the honest answer to "who touched this last", which a future audit surface may want.
  lastActorKind(e: any): string {
    return String(e?.lastActorKind || 'unknown');
  }

  // WHO cleared the last PENDING REQUEST — the field the breadcrumb renders (Phase 20.1).
  //
  // Withdrawing a request yourself and having it declined are the SAME on-chain transition, so the
  // actor is the entire signal. But `lastActorKind` answers a WIDER question, and rendering it as a
  // verdict was wrong in two directions: a freshly DECLARED election is a regulator act, so the row
  // claimed "your regulator declined the last request" before any request existed; and a SUCCESSFUL
  // approval also zeroes `requested`, so it read as a refusal too.
  //
  // `clearedBy` is written by the sync plugin only when a pending request was genuinely cleared
  // (state unchanged), and NULLed otherwise — so 'unknown' here means "nothing was cleared" and the
  // template correctly falls through to the bare em-dash.
  clearedByKind(e: any): string {
    return String(e?.clearedByKind || 'unknown');
  }

  electionLabel(v: number): string {
    // 3 = migrating is a state the service IS IN, not an event between states — its payment legs
    // in that currency are refused while it runs (S64).
    // `onc` / `offc` are the RULE vocabulary (S5, S63–S68) and stay that way in code and in the
    // rule documents. Nothing an operator reads uses them — this helper feeds every election
    // surface on the page, so the two spellings can never diverge across the tab.
    return ({ 1: 'On-Chain', 2: 'Off-Chain', 3: 'Migrating' } as Record<number, string>)[Number(v)] || 'Undeclared';
  }

  payRoleLabel(v: number): string {
    // The pay role is INVERTED relative to the election ids (onc 1 -> minter 2, offc 2 -> rail 1),
    // which is exactly why the label names the election it belongs to rather than standing alone.
    return ({ 1: 'Rail (Off-Chain)', 2: 'Minter (On-Chain)' } as Record<number, string>)[Number(v)] || '—';
  }

  providersForCurrency(currencyCode: number) {
    return this.paymentProviders().filter(p => Number(p.currencyCode) === Number(currencyCode));
  }

  /** Drives ONE page of an in-flight migration. Permissionless on chain (S68); paginated (S10). */
  async migrateElection(row: any) {
    const address = this.service()?.address;
    if (!address) return;
    this.migratingCcy.set(Number(row.currencyCode));
    try {
      const res = await this.apiService.vaultServiceElectionMigrate(address, Number(row.currencyCode), 50);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.updateFailed'), res.error);
        return;
      }
      await this.getElections();
    } catch (error) {
      console.error('Failed to drive migration', error);
      this.alertService.info(this.translate.instant('alerts.updateFailed'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.migratingCcy.set(null);
    }
  }

  /**
   * True when this currency's election can be switched by a request from us: it must already be
   * DECLARED (1 onc / 2 offc), not mid-migration (3), and not already carrying a pending request.
   *
   * Undeclared (0) is deliberately NOT offered — there is nothing to switch FROM, and the entity
   * cannot create the starting position either; only the regulator declares it.
   */
  canRequestSwitch(row: any): boolean {
    // Gated on the SAME System Function the Entity API enforces on
    // POST/DELETE /services/:address/election/switch. Without this an executive whose admin
    // turned the key off still saw the button and got an opaque 403 at submit.
    if (!this.features.systemFunctionEnabled('service-election-switch')) return false;
    const el = Number(row?.election);
    return (el === 1 || el === 2) && !row?.requestedTo;
  }

  /**
   * Requests a switch of an ALREADY-DECLARED election. This is a REQUEST, not a change: the
   * service's regulator approves it (in both directions), and only then does the paged migration
   * begin. Reuses the declare/switch modal in its 'switch' mode, where the currency is fixed and
   * the operator picks a target that must differ from what is in force.
   */
  async requestElectionSwitch(row: any) {
    const address = this.service()?.address;
    if (!address || !this.canRequestSwitch(row)) return;

    const currencyCode = Number(row.currencyCode);
    const chosen = await this.electionModalService.show('switch', {
      // Switch mode fixes the currency; the list exists only so the modal can label it.
      currencies: [{ currencyCode, currencyName: row.currencySymbol || String(currencyCode) }],
      currencyCode,
      currentElection: Number(row.election),
    });
    if (!chosen) return;

    this.loadingService.show(this.translate.instant('common.updating'));
    try {
      const res = await this.apiService.vaultServiceElectionRequestSwitch(address, currencyCode, chosen.election);
      if ((res as any)?.error) {
        this.alertService.info(this.translate.instant('alerts.updateFailed'), (res as any).error);
        return;
      }
      await this.getElections();
      if ((res as any)?.requestId) {
        this.alertService.info(this.translate.instant('approvals.submittedTitle'),
          this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
      }
    } catch (error) {
      console.error('Failed to request election switch', error);
      this.alertService.info(this.translate.instant('alerts.updateFailed'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  /** Withdraws a PENDING switch request. Approval freezes the currency — a stale request is a hazard. */
  async withdrawElectionSwitch(row: any) {
    const address = this.service()?.address;
    if (!address) return;
    const ok = await this.alertService.show(
      'Withdraw switch request',
      `Withdraw the pending switch to ${this.electionLabel(row.requestedTo)} for currency `
      + `${row.currencySymbol || row.currencyCode}? The election stays as it is.`,
      this.translate.instant('common.remove'));
    if (!ok) return;
    this.loadingService.show(this.translate.instant('common.updating'));
    try {
      const res = await this.apiService.vaultServiceElectionWithdraw(address, Number(row.currencyCode));
      if (res?.error) { this.alertService.info(this.translate.instant('alerts.updateFailed'), res.error); return; }
      await this.getElections();
    } catch (error) {
      console.error('Failed to withdraw switch request', error);
    } finally {
      this.loadingService.hide();
    }
  }

  setTab(tab: 'overview' | 'info' | 'licenses' | 'providers' | 'election' | 'metadata' | 'assets' | 'subscriptions' | 'trxs' | 'liquidity' | 'docs') {
    if (tab === 'election') this.getElections();
    this.activeTab.set(tab);
    if (tab === 'info' || tab === 'metadata' || tab === 'providers') this.getServiceDetails();
    // Re-fetch on entry. `getServiceDetails` already produces the set on load — and MUST, since
    // `isTokenProvider()` gates eight template branches off it — so this is a refresh, not the
    // only producer. It matters because a license is the one thing on this page that changes
    // WITHOUT the tenant acting: the regulator grants or suspends it elsewhere.
    // Grants ride the same tab and the same reasoning: a grant, like a licence, changes without
    // the tenant acting — the regulator sets or voids it elsewhere. Loaded in parallel; a grants
    // failure must not stop the licences rendering, which is why they are separate awaits.
    if (tab === 'licenses') { this.loadLicenses(); this.loadGrants(); }
    if (tab === 'assets') this.getAssets();
    if (tab === 'subscriptions') this.getSubscriptions();
    if (tab === 'trxs') this.getTransactions(1, 500);
    if (tab === 'liquidity') this.getLiquidity();
  }   

  private readonly stateNames: Record<number, string> = {
    0: 'Inactive', 1: 'Initiated', 2: 'Active', 3: 'Suspended', 4: 'Deactivated',
  };

  private mapVaultService(raw: any): Service {
    const meta = typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {};
    return {
      address: raw.address,
      entity: raw.entity ?? '',
      entityName: raw.entity_name ?? raw.entity ?? '',
      name: raw.name,
      metadata: typeof raw.metadata === 'object' ? JSON.stringify(raw.metadata ?? {}) : (raw.metadata ?? ''),
      description: meta.description ?? '',
      email: meta.email ?? '',
      mobile: meta.mobile ?? '',
      website: meta.website ?? '',
      contact: (meta.contact && typeof meta.contact === 'object') ? {
        email:   meta.contact.email   ?? '',
        phone:   meta.contact.phone   ?? '',
        website: meta.contact.website ?? '',
        address: meta.contact.address ?? '',
      } : {
        email:   meta.email ?? '',
        phone:   meta.telephone ?? meta.mobile ?? '',
        website: meta.website ?? '',
        address: meta.address ?? '',
      },
      countryCode: raw.country_code ?? 0,
      countryName: raw.country_name ?? '',
      verificationLevel: raw.verification_level ?? 0,
      verificationLevelName: raw.verification_level_name ?? String(raw.verification_level ?? ''),
      // ⚠️ Phase 28 step (e): service_type / service_type_name / party_class(_name) /
      // market_class(_name) / market_class_confirmed are GONE from `services_view`. The
      // license SET replaces them and is EMPTY until the licensing lane's read route lands —
      // deliberately not defaulted to anything that would render as a type.
      licenses: raw.licenses ?? [],
      regulator: raw.regulator ?? '',
      regulatorName: raw.regulator_name ?? '',
      regulatorSymbol: '',
      validator: raw.validator ?? '',
      paymentProcessor: raw.payment_processor ?? '',
      suspended: raw.suspended === true || raw.suspended === 1,
      state: raw.state ?? 0,
      stateName: raw.state_name ?? this.stateNames[raw.state] ?? String(raw.state ?? ''),
      visibility: raw.visibility ?? 1,
      custodian: raw.custodian ?? '',
      custodianActive: raw.custodian_active === false ? false : true,
      validatorActive: raw.validator_active === false ? false : true,
      // Straight-through mode. Defaults FALSE on an absent field — unlike the two above, whose
      // absence means "active until told otherwise". Here absence means the service never
      // opted in, and defaulting true would show the toggle on for every existing service.
      straightThrough: raw.straight_through === true || raw.straight_through === 1,
    } as Service;
  }

  private mapVaultAsset(raw: any): Asset {
    return {
      address: raw.address,
      name: raw.name,
      symbol: raw.symbol,
      assetClass: raw.asset_class ?? 0,
      assetClassName: raw.asset_class_name ?? String(raw.asset_class ?? ''),
      metadata: typeof raw.metadata === 'object' ? JSON.stringify(raw.metadata ?? {}) : (raw.metadata ?? ''),
      totalSupply: raw.total_supply ?? 0,
      circulating: raw.circulating ?? 0,
      countryCode: 0,
      countryName: raw.country_name ?? '',
      currencyCode: raw.currency_code ?? '',
      currencyName: raw.currency_name ?? '',
      createdOn: raw.created_on ?? 0,
      services: (raw.services ?? []).map((s: string) => ({ service: s, serviceName: s })),
      issuer: raw.issuer ?? '',
      issuerName: raw.issuer_name ?? raw.issuer ?? '',
      manager: raw.manager ?? '',
      managerName: raw.manager_name ?? raw.manager ?? '',
      regulator: raw.regulator ?? '',
      regulatorName: raw.regulator_name ?? '',
      regulatorSymbol: '',
      suspended: raw.suspended === true || raw.suspended === 1,
      state: raw.state ?? 0,
      stateName: raw.asset_state_name ?? this.stateNames[raw.state] ?? String(raw.state ?? ''),
    } as Asset;
  }

  private mapVaultSubscription(raw: any): Subscription {
    return {
      subscription: raw.address,
      entity: raw.entity ?? '',
      entityName: '',
      service: raw.service ?? '',
      serviceName: '',
      validator: raw.validator ?? '',
      validatorName: '',
      validatorVerificationId: raw.validator_level ?? 0,
      validatorTimestamp: raw.validator_trx_ts ?? 0,
      regulator: raw.regulator ?? '',
      regulatorName: '',
      createdAt: raw.created_at ?? 0,
      suspended: raw.suspended === true || raw.suspended === 1,
      state: raw.state ?? 0,
      stateName: this.stateNames[raw.state] ?? String(raw.state ?? ''),
      holdingsByCurrency: Array.isArray(raw.holdingsByCurrency) ? raw.holdingsByCurrency : [],
      holdingsTotalValue: Number(raw.holdingsTotalValue ?? 0),
    } as Subscription;
  }

  private mapVaultTransaction(raw: any): AssetTransaction {
    let trxRefNo = '';
    if (raw.data && typeof raw.data === 'object') { trxRefNo = raw.data.trxRefNo || ''; }
    return {
      trxId: raw.id,
      serviceTrxId: raw.service_trx_id ?? 0,
      trxType: raw.type ? (raw.type.charAt(0).toUpperCase() + raw.type.slice(1)) : 'Transfer',
      sender: raw.sender ?? '',
      manager: raw.manager ?? '',
      managerName: raw.manager_name ?? raw.manager ?? '',
      service: raw.service ?? '',
      serviceName: raw.service_name ?? raw.service ?? '',
      asset: raw.asset ?? '',
      assetName: raw.asset_name ?? raw.asset ?? '',
      assetSymbol: raw.asset_symbol ?? '',
      currencyCode: raw.currency_code ?? '',
      from: raw.from_addr ?? '',
      to: raw.to_addr ?? '',
      subscription: raw.subscription ?? '',
      tokens: raw.tokens ?? 0,
      price: raw.price ?? 0,
      totalPrice: raw.total ?? 0,
      data: typeof raw.data === 'string' ? raw.data : JSON.stringify(raw.data ?? {}),
      trxRefNo,
      time: raw.time ?? 0,
    } as AssetTransaction;
  }

  /*
      Every license this service has ever touched — Requested, Denied, Suspended and Revoked
      included, because an entity that applied must be able to see that it was refused.

      🔴 `service.licenses` GETS THE ACTIVE SET ONLY. `active` comes from `hasLicense`, the chain's
      own predicate, and it is what decides capability; `state` only says what happened. Feeding
      the full set into `licenses` would let a REVOKED class light up `isTokenProvider()` and open
      an issuer surface this service may not use — which the route's own comment records as having
      nearly happened twice already, in two other apps.
  */
  async loadLicenses() {
    this.licensesLoading.set(true);
    try {
      const res: any = await this.apiService.vaultGetServiceLicenses(this.serviceAddress);
      const rows: ServiceLicense[] = Array.isArray(res?.licenses) ? res.licenses : [];
      this.licenses.set(rows);
      const active = rows.filter((r) => r.active).map((r) => Number(r.classId));
      const svc = this.service();
      if (svc) this.service.set({ ...svc, licenses: active } as any);
    } catch {
      // Left alone rather than emptied: an empty list is indistinguishable from "holds none", and
      // this is the read whose silent emptiness WAS the reported defect.
      this.licenses.set([]);
    } finally {
      this.licensesLoading.set(false);
    }
  }

  /**
   * Phase 17 grants for this service. Read only.
   *
   * ⚠️ On failure the rows are CLEARED and `grantsMirrored` is set to null, which the template
   * renders as "could not be read" — never as an empty grant set. A permissions surface that
   * silently shows nothing is indistinguishable from one showing a correct default-deny, and the
   * operator would act on the wrong one.
   */
  async loadGrants() {
    this.grantsLoading.set(true);
    try {
      const res: any = await this.apiService.vaultGetServiceGrants(this.serviceAddress);
      this.grants.set(Array.isArray(res?.rows) ? res.rows : []);
      this.grantsMirrored.set(typeof res?.mirrored === 'number' ? res.mirrored : null);
      this.grantsLoaded.set(true);
    } catch {
      this.grants.set([]);
      this.grantsMirrored.set(null);
      this.grantsLoaded.set(false);
    } finally {
      this.grantsLoading.set(false);
    }
  }

  /**
   * The sentence a row's `source` + `level` actually means, in the entity's own terms.
   *
   * 🔴 THREE REFUSALS THAT LOOK ALIKE AND ARE NOT. `stale` must never borrow `default`'s wording:
   * a regulator DID decide, and a later supervisory action (`grantInvalidateAll`) voided it.
   * Calling that "no decision recorded" would be a false statement about a real event, and it
   * points the operator at the wrong conversation with their regulator.
   */
  grantMeaning(g: ServiceGrant): string {
    if (g.granted) {
      return g.maxLevel > 1
        ? `Permitted, at level ${g.level} of ${g.maxLevel}.`
        : 'Permitted by your regulator.';
    }
    if (g.source === 'stale') {
      return 'Withdrawn. Your regulator granted this and a later supervisory action voided it.';
    }
    if (g.source === 'explicit') {
      return 'Refused. Your regulator considered this and declined it.';
    }
    return 'No decision recorded — refused by default.';
  }

  /** Pill class per row. Only a granted row is green; every refusal is visibly a refusal. */
  grantPillClass(g: ServiceGrant): string {
    if (g.granted) return 'bg-emerald-100 text-emerald-800';
    // Amber for a DECIDED refusal (explicit or withdrawn): a regulator acted, and the entity has
    // someone to ask. Gray for the default: nobody has looked at it yet.
    if (g.source === 'explicit' || g.source === 'stale') return 'bg-amber-100 text-amber-800';
    return 'bg-gray-100 text-gray-600';
  }

  grantPillLabel(g: ServiceGrant): string {
    if (g.granted) return 'Permitted';
    if (g.source === 'stale') return 'Withdrawn';
    if (g.source === 'explicit') return 'Refused';
    return 'Not granted';
  }

  /** `grant.assets.mint` -> `Mint`. The key is the identifier; this is the reading. */
  grantLabel(key: string): string {
    const tail = String(key || '').split('.').slice(2).join(' ');
    if (!tail) return key;
    return tail.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }

  grantGroupLabel(group: string): string {
    return String(group || '').replace(/^./, (c) => c.toUpperCase());
  }

  /** Class id -> name, from the on-chain catalog. Never a local map — see the note above. */
  async loadLicenseClasses() {
    try {
      const vars: any = await this.apiService.vaultGetGlobalVariablesByCategory('License Class');
      const map: Record<number, string> = {};
      for (const v of (vars || [])) map[Number(v.variableId ?? v.variable_id)] = v.name;
      this.licenseClassNames.set(map);
    } catch { this.licenseClassNames.set({}); }
  }

  async getServiceDetails(silent = false) {
    if (!silent) this.loadingService.show(this.translate.instant('common.loadingData'));
    const [raw, summary] = await Promise.all([
      this.apiService.vaultGetService(this.serviceAddress),
      this.apiService.vaultGetServiceWithheldSummary(this.serviceAddress).catch(() => null),
    ]);
    if (summary) {
      this.withheldCredit.set((summary.creditByCurrency ?? []).filter((c: any) => c.withheld > 0));
      this.withheldAssets.set((summary.assetsByAddress ?? []).filter((a: any) => a.totalWithheld > 0));
    }
    if (raw) {
      const service = this.mapVaultService(raw);
      this.service.set(service);
      /*
          ⚠️ AWAITED, AND BEFORE ANYTHING READS `isTokenProvider()`. That computed gates eight
          branches of this template, and it derives from `service.licenses` — which this call is
          the only producer of. Firing it late reproduces the very blankness being fixed.
      */
      await this.loadLicenses();
      this.resolveLinkedNames(raw.validator, raw.payment_processor, raw.custodian, raw.address);
      this.apiService.vaultGetServiceParties(this.serviceAddress)
        // Each bucket is defaulted individually, not just the whole object: an API that predates
        // the clearing-house role returns the other three and no `clearingHouses`, and a bare
        // `p ?? {…}` would leave it undefined for `resolvePartyNames` to dereference.
        .then(p => {
          this.serviceParties.set({
            validators: p?.validators ?? [],
            paymentProcessors: p?.paymentProcessors ?? [],
            custodians: p?.custodians ?? [],
            clearingHouses: p?.clearingHouses ?? [],
            escrowClearingHouses: p?.escrowClearingHouses ?? [],
          });
          this.resolvePartyNames();
        })
        .catch(() => {});
      if (service.suspended) {
        const logs = await this.apiService.vaultGetStateChangeLogs(service.address, 1, 1);
        if (logs?.logs?.length > 0) {
          this.suspensionReason.set(logs.logs[0].reason || '');
        }
      } else {
        this.suspensionReason.set('');
      }
      this.loadMediaImages();
    }
    if (!silent) this.loadingService.hide();
  }

  // ─── Images (public media — avatar / banner / gallery) ──────────────────────
  // Parsed `media` index from the service metadata JSON string.
  serviceMedia = computed<MediaIndex | null>(() => {
    const raw = this.service()?.metadata || '';
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && !Array.isArray(obj) && obj.media && typeof obj.media === 'object' && !Array.isArray(obj.media)) {
        return obj.media as MediaIndex;
      }
    } catch { /* non-JSON metadata */ }
    return null;
  });

  mediaImages = computed<{ entry: MediaEntry; role: 'avatar' | 'banner' | 'gallery' }[]>(() => {
    const media = this.serviceMedia();
    if (!media) return [];
    const rows: { entry: MediaEntry; role: 'avatar' | 'banner' | 'gallery' }[] = [];
    if (media.avatar) rows.push({ entry: media.avatar, role: 'avatar' });
    if (media.banner) rows.push({ entry: media.banner, role: 'banner' });
    for (const img of media.images ?? []) rows.push({ entry: img, role: 'gallery' });
    return rows;
  });

  mediaImageUrls = signal<Record<number, string>>({});
  mediaImagesLoading = signal(false);

  async loadMediaImages() {
    const rows = this.mediaImages();
    if (!rows.length) return;
    const current = this.mediaImageUrls();
    const missing = rows.filter(r => !current[r.entry.documentId]);
    if (!missing.length) return;
    this.mediaImagesLoading.set(true);
    try {
      for (const r of missing) {
        const res = await this.apiService.serviceDocumentFetchFile(this.serviceAddress, r.entry.documentId);
        if (res?.blobUrl) this.mediaImageUrls.update(m => ({ ...m, [r.entry.documentId]: res.blobUrl }));
      }
    } finally {
      this.mediaImagesLoading.set(false);
    }
  }

  private revokeMediaImageUrls() {
    for (const url of Object.values(this.mediaImageUrls())) URL.revokeObjectURL(url);
    this.mediaImageUrls.set({});
  }

  private async refreshMediaImages() {
    this.revokeMediaImageUrls();
    await this.getServiceDetails(true);
    await this.loadMediaImages();
  }

  async openAddImageModal() {
    const data = await this.imageAddModal.show();
    if (!data) return;
    this.loadingService.show(this.translate.instant('media.uploading'));
    try {
      const res = await this.apiService.serviceDocumentAddMultipart(this.serviceAddress, data.file, {
        title: data.title,
        description: '',
        fileType: data.file.type,
        documentType: data.documentType,
        documentState: 1,
        ...(data.role !== 'gallery' ? { imageRole: data.role } : {}),
      });
      if (res?.error) this.alertService.info(this.translate.instant('alerts.error'), res.error);
      else await this.refreshMediaImages();
    } catch {
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  async changeMediaRole(documentId: number, role: 'avatar' | 'banner' | 'gallery') {
    this.loadingService.show(this.translate.instant('media.updatingRole'));
    try {
      const res = await this.apiService.vaultSetServiceMediaRole(this.serviceAddress, documentId, role);
      if (res?.error) this.alertService.info(this.translate.instant('alerts.error'), res.error);
      else await this.refreshMediaImages();
    } catch {
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  async removeMediaImage(row: { entry: MediaEntry; role: string }) {
    const confirmed = await this.alertService.show(
      this.translate.instant('media.removeConfirmTitle'),
      this.translate.instant('media.removeConfirmMessage', { title: row.entry.title }),
      this.translate.instant('common.remove'),
    );
    if (!confirmed) return;
    this.loadingService.show(this.translate.instant('media.removing'));
    try {
      const res = await this.apiService.serviceDocumentRemove(this.serviceAddress, row.entry.documentId);
      if (res?.error) this.alertService.info(this.translate.instant('alerts.error'), res.error);
      else await this.refreshMediaImages();
    } catch {
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  private async resolveLinkedNames(validator: string, paymentProcessor: string, custodian: string, serviceAddress: string) {
    const zeroAddr = '0x0000000000000000000000000000000000000000';
    this.validatorName.set('');
    this.paymentProcessorName.set('');
    this.custodianName.set('');

    const promises: Promise<void>[] = [];
    if (validator && validator !== zeroAddr) {
      promises.push(
        this.apiService.vaultGetValidators(1, 50).then(data => {
          const match = data?.validators?.find((v: any) => v.address.toLowerCase() === validator.toLowerCase());
          if (match?.name) this.validatorName.set(match.name);
        })
      );
    }
    if (paymentProcessor && paymentProcessor !== zeroAddr) {
      promises.push(
        this.apiService.vaultGetPaymentProcessors(1, 50).then(data => {
          const match = data?.paymentProcessors?.find((s: any) => s.address.toLowerCase() === paymentProcessor.toLowerCase());
          if (match?.name) this.paymentProcessorName.set(match.name);
        })
      );
    }
    // Custodian: only resolve a friendly name when it's external (not self-custody).
    if (custodian && custodian !== zeroAddr && custodian.toLowerCase() !== (serviceAddress || '').toLowerCase()) {
      const currentService = this.service();
      const regulator = currentService?.regulator;
      if (regulator) {
        promises.push(
          this.apiService.vaultGetEndorsedCustodians(regulator, 1, 50).then(data => {
            const match = data?.custodians?.find((c: any) => c.address.toLowerCase() === custodian.toLowerCase());
            if (match?.name) this.custodianName.set(match.name);
          }).catch(() => {})
        );
      }
    }
    await Promise.all(promises);
  }

  // Enrich the 1:N provider lists with friendly names, resolved from the same regulator-scoped
  // registries used for the legacy primary bindings. Validators / PPs are entity-cross type-2
  // services (not in this entity's own services table), so we can't resolve them by a local join —
  // we cross-reference the picker lists by address. Self-custody keeps its own label (no name).
  private async resolvePartyNames() {
    const parties = this.serviceParties();
    const regulator = this.service()?.regulator;
    const [valData, ppData, custData, chData] = await Promise.all([
      parties.validators.length ? this.apiService.vaultGetValidators(1, 200).catch(() => null) : Promise.resolve(null),
      parties.paymentProcessors.length ? this.apiService.vaultGetPaymentProcessors(1, 200).catch(() => null) : Promise.resolve(null),
      (parties.custodians.length && regulator) ? this.apiService.vaultGetEndorsedCustodians(regulator, 1, 200).catch(() => null) : Promise.resolve(null),
      parties.clearingHouses.length ? this.apiService.vaultGetClearingHouses(1, 200).catch(() => null) : Promise.resolve(null),
    ]);
    const nameFrom = (list: any[] | undefined, addr: string): string | undefined => {
      const m = (list ?? []).find((x: any) => x.address?.toLowerCase() === addr.toLowerCase());
      return m?.name || undefined;
    };
    this.serviceParties.set({
      validators: parties.validators.map(p => ({ ...p, name: nameFrom(valData?.validators, p.address) })),
      paymentProcessors: parties.paymentProcessors.map(p => ({ ...p, name: nameFrom(ppData?.paymentProcessors, p.address) })),
      custodians: parties.custodians.map(p => ({ ...p, name: nameFrom(custData?.custodians, p.address) })),
      clearingHouses: parties.clearingHouses.map(p => ({ ...p, name: nameFrom(chData?.clearingHouses, p.address) })),
      // No name lookup: there is no escrow-CH directory endpoint, so the address stands alone
      // rather than borrowing the entities-CH list, which is a DIFFERENT appointment.
      escrowClearingHouses: (parties.escrowClearingHouses ?? []).map(p => ({ ...p, name: '' })),
    });
  }

  isSelfCustody(): boolean {
    const s = this.service();
    if (!s || !s.custodian) return false;
    return s.custodian.toLowerCase() === s.address.toLowerCase();
  }

  getStateClass(stateId: number | undefined): string {
    if (stateId === undefined) return 'bg-gray-100 text-gray-800';
    switch(stateId) {
      case 1: return 'bg-yellow-100 text-yellow-800'; // Initiated
      case 2: return 'bg-green-100 text-green-800';   // Active
      case 3: return 'bg-orange-100 text-orange-800'; // Suspended
      case 4: return 'bg-red-100 text-red-800';       // Deactivated
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  async gotoEntity(address: string) {
    this.router.navigate(['/authorized/entities/details/' + address]);
  }

  async getAssets(silent = false) {
    if (!silent) this.loadingService.show(this.translate.instant('common.loadingData'));
    const data = await this.apiService.vaultGetAssets(0, 500, this.serviceAddress);
    if (data?.assets) this.assets.set(data.assets.map((a: any) => this.mapVaultAsset(a)));
    if (!silent) this.loadingService.hide();
  }

  gotoAsset(asset: Asset) {
    this.router.navigate(['/authorized/assets/details/' + asset.address]);
  }
  
  async getSubscriptions(silent = false) {
    if (!silent) this.loadingService.show(this.translate.instant('common.loadingData'));
    const data = await this.apiService.vaultGetSubscriptions(this.serviceAddress, 0, 500);
    if (data?.subscriptions) this.subscriptions.set(data.subscriptions.map((s: any) => this.mapVaultSubscription(s)));
    if (!silent) this.loadingService.hide();
  }

  async openEditModal() {
    const currentService = this.service();
    if (!currentService) return;

    const result = await this.serviceEditService.show(currentService);
    if (result) {
      this.loadingService.show(this.translate.instant('services.details.loadingMsgs.updatingService'));
      try {
        // Execute updates SEQUENTIALLY instead of in parallel
        if (result.name !== currentService.name) {
          await this.apiService.vaultUpdateServiceName(currentService.address, result.name!);
        }

        // Contact info (email / phone / website / address) is edited via the "Edit Metadata"
        // flow (nested `contact` key) — this modal only edits name + validator + payment processor.

        // Normalize current values: treat zero address and empty string as equivalent
        const zeroAddr = '0x0000000000000000000000000000000000000000';
        const currentValidator = (currentService.validator && currentService.validator !== zeroAddr) ? currentService.validator : '';
        const currentPaymentProcessor = (currentService.paymentProcessor && currentService.paymentProcessor !== zeroAddr) ? currentService.paymentProcessor : '';

        if (result.validator !== currentValidator) {
          await this.apiService.vaultSetServiceValidator(currentService.address, result.validator || '');
        }

        if (result.paymentProcessor !== currentPaymentProcessor) {
          await this.apiService.vaultSetServicePaymentProcessor(currentService.address, result.paymentProcessor || '');
        }

        await this.getServiceDetails();

      } catch (error) {
        console.error('Failed to update service', error);
        this.alertService.info(this.translate.instant('alerts.updateFailed'), this.translate.instant('services.details.info.updateServiceError'));
      } finally {
        this.loadingService.hide();
      }
    }
  }

  async onChangeVisibility() {
    const currentService = this.service();
    if (!currentService) return;
    const next = currentService.visibility === 2 ? 1 : 2;
    this.loadingService.show(this.translate.instant('services.details.loadingMsgs.updatingVisibility'));
    try {
      const res = await this.apiService.vaultSetServiceVisibility(currentService.address, next);
      await this.getServiceDetails();
      if (res?.requestId) {
        this.alertService.info(this.translate.instant('approvals.submittedTitle'), this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
      }
    } catch (error) {
      console.error('Failed to change visibility', error);
      this.alertService.info(this.translate.instant('alerts.updateFailed'), this.translate.instant('services.details.info.updateVisibilityError'));
    } finally {
      this.loadingService.hide();
    }
  }

  // Straight-through transactions (Phase 21). Confirmed rather than a bare toggle: it changes
  // which money-moving verbs the service answers, and it is written to the service's ON-CHAIN
  // metadata, so it costs a relayed transaction either way.
  async onToggleStraightThrough() {
    const currentService = this.service();
    if (!currentService) return;
    const next = !currentService.straightThrough;

    const confirmed = await this.alertService.show(
      this.translate.instant(next ? 'services.details.straightThrough.confirmEnableTitle' : 'services.details.straightThrough.confirmDisableTitle'),
      this.translate.instant(next ? 'services.details.straightThrough.confirmEnableMessage' : 'services.details.straightThrough.confirmDisableMessage'),
      this.translate.instant('alerts.ok'),
    );
    if (!confirmed) return;

    this.loadingService.show(this.translate.instant('services.details.straightThrough.updating'));
    try {
      await this.apiService.vaultSetServiceStraightThrough(currentService.address, next);
      await this.getServiceDetails();
    } catch (error) {
      console.error('Failed to change straight-through mode', error);
      this.alertService.info(this.translate.instant('alerts.updateFailed'), this.translate.instant('services.details.straightThrough.updateError'));
    } finally {
      this.loadingService.hide();
    }
  }

  async openEditMetadataModal() {
    const currentService = this.service();
    if (!currentService) return;

    // Parse the service's metadata JSON string into { description, contact, entries } for the
    // editor. `contact` (nested) + legacy flat contact keys are excluded from the KV entries.
    let description = '';
    let contact = { email: '', phone: '', website: '', address: '' };
    const entries: [string, string][] = [];
    // 'sp' is the provider-discovery object ({ sp: { kind, signer, baseUrl } }) consumed by the
    // Token Exchange / DID App / DID API trust chain. It is RESERVED out of the flat string→string
    // KV editor (which would rewrite the nested object as a JSON-string-in-a-string) and
    // re-attached verbatim on save — the modal's result is a FULL REPLACEMENT, so without the
    // re-attach an unrelated metadata edit would silently DELETE the discovery keys.
    // `straightThrough` (Phase 21) is reserved for a DIFFERENT reason than `sp`, and the
    // difference decides whether it needs re-attaching below. `sp` is preserved by NOBODY
    // server-side, so it must be carried across this modal by hand. `straightThrough` IS
    // carried forward by the API's own `serviceUpdateMetadata` (which strips a client-supplied
    // value and re-reads the live one), so it needs only to stay OUT of the flat KV editor —
    // where it would render as a raw `true` row and be written back as the STRING "true",
    // which the API's strict `=== true` check would then read as OFF.
    const RESERVED = new Set(['description', 'media', 'contact', 'email', 'telephone', 'mobile', 'website', 'address', 'sp', 'straightThrough']);
    let preservedSp: unknown;
    try {
      const obj = JSON.parse(currentService.metadata || '{}');
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        description = typeof obj.description === 'string' ? obj.description : '';
        preservedSp = obj.sp;
        const c = (obj.contact && typeof obj.contact === 'object') ? obj.contact : {};
        contact = {
          email:   c.email   ?? obj.email   ?? '',
          phone:   c.phone   ?? obj.telephone ?? obj.mobile ?? '',
          website: c.website ?? obj.website ?? '',
          address: c.address ?? obj.address ?? '',
        };
        for (const [k, val] of Object.entries(obj)) {
          if (RESERVED.has(k)) continue;
          entries.push([k, typeof val === 'string' ? val : JSON.stringify(val)]);
        }
      }
    } catch (_) { /* malformed metadata → start blank */ }

    const result = await this.metadataEditModal.show({ title: this.translate.instant('services.details.info.editMetadataModalTitle'), description, contact, entries });
    if (!result) return;
    if (preservedSp !== undefined) (result as Record<string, unknown>)['sp'] = preservedSp;
    this.loadingService.show(this.translate.instant('services.details.loadingMsgs.updatingMetadata'));
    try {
      const res = await this.apiService.vaultUpdateServiceMetadata(currentService.address, result);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error || this.translate.instant('services.details.info.updateMetadataError'));
      } else {
        await this.getServiceDetails();
      }
    } catch (error) {
      console.error('Failed to update metadata', error);
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  async openChangeStateModal(){
    const currentService = this.service();
    if (!currentService) return;

    const result = await this.serviceStateService.show(currentService.state);
    if (result !== null && result.state !== currentService.state) {
        this.loadingService.show(this.translate.instant('services.details.loadingMsgs.changingState'));
        try {
            const res = await this.apiService.vaultUpdateServiceState(currentService.address, result.state, result.reason);
            await this.getServiceDetails();
            if (res?.requestId) {
              this.alertService.info(this.translate.instant('approvals.submittedTitle'), this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
            }
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
    }    
  }

  // ─── 1:N provider attach / detach ──────────────────────────────────────────
  // partyType: 1=Validator, 2=PaymentGateway, 3=Bank, 4=Custodian, 5=ClearingHouse,
  // 6=EscrowClearingHouse — the SHARED platform numbering, identical to the curated spType and to
  // ServicePartiesLib's on-chain roles. ⚠️ This comment read "3=Custodian, 4=ClearingHouse" (the
  // pre-split numbering, before BANK was inserted at 3) and the custodian attach below followed
  // it into an always-reverting call. Use PARTY_CLASS, never a literal.
  // Reuses the existing picker modals to choose an address to ATTACH (a service may hold many of
  // each role).

  private async _attachParty(partyType: number, party: string) {
    const currentService = this.service();
    if (!currentService || !party) return;
    this.loadingService.show(this.translate.instant('services.details.loadingMsgs.attachingProvider'));
    try {
      const res = await this.apiService.vaultAttachServiceParty(currentService.address, partyType, party);
      if ((res as any)?.error) { this.alertService.info(this.translate.instant('alerts.updateFailed'), (res as any).error); return; }
      await this.getServiceDetails();
      if ((res as any)?.requestId) this.alertService.info(this.translate.instant('approvals.submittedTitle'), this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
    } catch (error) {
      console.error('Failed to attach provider', error);
      this.alertService.info(this.translate.instant('alerts.updateFailed'), this.translate.instant('services.details.info.attachProviderError'));
    } finally {
      this.loadingService.hide();
    }
  }

  // One place for the party-class badge colour. Six `[class.bg-x]="p.partyType === N"` bindings
  // in the template were six naked digits that would silently mis-colour on the next renumber —
  // and, being presentational, would never fail loudly.
  partyBadgeClass(partyType: number): string {
    return ({
      [PARTY_CLASS.VALIDATOR]:       'bg-indigo-100 text-indigo-800',
      [PARTY_CLASS.PAYMENT_GATEWAY]: 'bg-sky-100 text-sky-800',
      [PARTY_CLASS.BANK]:            'bg-cyan-100 text-cyan-800',
      [PARTY_CLASS.CUSTODIAN]:       'bg-purple-100 text-purple-800',
      [PARTY_CLASS.CLEARING_HOUSE]:  'bg-teal-100 text-teal-800',
      [PARTY_CLASS.ESCROW_CH]:       'bg-amber-100 text-amber-800',
    } as Record<number, string>)[partyType] ?? 'bg-gray-100 text-gray-700';
  }

  /** The inactive-pill tooltip differs for a custodian; everything else reads as a validator. */
  partyInactiveTooltipKey(partyType: number): string {
    return partyType === PARTY_CLASS.CUSTODIAN
      ? 'services.details.providers.custodianInactiveTooltip'
      : 'services.details.providers.validatorInactiveTooltip';
  }

  async detachParty(partyType: number, party: string) {
    const currentService = this.service();
    if (!currentService) return;
    // Keyed off PARTY_CLASS, and it FALLS BACK to the canonical name rather than to a guess.
    // The old chain ended `: custodian`, so after the renumbering every unlisted id — the
    // clearing house among them — was labelled 'Custodian' in the confirmation for a
    // destructive action. An unknown class is a fact worth showing, not a default to absorb.
    const labelKey = ({
      [PARTY_CLASS.VALIDATOR]:       'services.details.info.partyLabelValidator',
      [PARTY_CLASS.PAYMENT_GATEWAY]: 'services.details.info.partyLabelPaymentProcessor',
      [PARTY_CLASS.BANK]:            'services.details.info.partyLabelPaymentProcessor',
      [PARTY_CLASS.CUSTODIAN]:       'services.details.info.partyLabelCustodian',
      [PARTY_CLASS.CLEARING_HOUSE]:  'services.details.info.partyLabelClearingHouse',
      [PARTY_CLASS.ESCROW_CH]:       'services.details.info.partyLabelEscrowClearingHouse',
    } as Record<number, string>)[partyType];
    const label = labelKey ? this.translate.instant(labelKey) : partyClassName(partyType);
    const ok = await this.alertService.show(this.translate.instant('services.details.info.removeProviderTitle'), this.translate.instant('services.details.info.detachConfirm', { label }), this.translate.instant('common.remove'));
    if (!ok) return;
    this.loadingService.show(this.translate.instant('services.details.loadingMsgs.detachingProvider'));
    try {
      const res = await this.apiService.vaultDetachServiceParty(currentService.address, partyType, party);
      if ((res as any)?.error) { this.alertService.info(this.translate.instant('alerts.updateFailed'), (res as any).error); return; }
      await this.getServiceDetails();
      if ((res as any)?.requestId) this.alertService.info(this.translate.instant('approvals.submittedTitle'), this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
    } catch (error) {
      console.error('Failed to detach provider', error);
      this.alertService.info(this.translate.instant('alerts.updateFailed'), this.translate.instant('services.details.info.detachProviderError'));
    } finally {
      this.loadingService.hide();
    }
  }

  async attachValidator() {
    const currentService = this.service();
    if (!currentService) return;
    const chosen = await this.validatorModalService.show('', currentService.verificationLevel,
      this.serviceParties().validators.map(p => p.address));
    if (!chosen) return;
    await this._attachParty(1, chosen);
  }

  /**
   * A payment provider does NOT attach through `partyAttach` — its currency-less role sets are
   * RETIRED (`ServicePartiesLib.Layout.paymentGateways` is commented as such and nothing reads it).
   * It attaches PER CURRENCY via `addPaymentProvider(provider, currencyCode, payRole)`, and the
   * contract validates the role against that currency's ELECTION.
   *
   * This used to call `_attachParty(2, …)`. On chain that lands in `_partyAuthorised`, whose
   * role branches cover only VALIDATOR and CUSTODIAN — everything else falls through to
   * `_isClearingHouseFor`. So attaching a payment gateway asked whether it was a CLEARING HOUSE
   * and failed with "ServiceTemplate: party not authorised for regulator", which names the wrong
   * problem entirely.
   */
  async attachPaymentProcessor() {
    const address = this.service()?.address;
    if (!address) return;

    // ⚠️ Load the elections FIRST. They are otherwise only fetched when the Election TAB is
    // opened, so arriving straight on Service Providers (a deep link, or the Information tab's
    // "Manage Providers" jump-off) left `elections()` empty and this reported "no election
    // declared" for a service that has one — blaming the regulator for our own missing fetch.
    await this.getElections();

    // Only a currency with a DECLARED election can accept an attachment — before that there is no
    // role to validate against. A MIGRATING currency accepts the DESTINATION's role, matching
    // `_requirePayRoleMatchesElection`, so it is offered too rather than silently dropped.
    const currencies = this.elections()
      .map((e: any) => {
        const declared = Number(e.election);
        const effective = declared === 3 ? Number(e.migratingTo) : declared;
        if (effective !== 1 && effective !== 2) return null;
        // ⚠️ INVERTED (onc 1 -> minter 2, offc 2 -> rail 1) — hence the shared helper rather than
        // a second inline copy. An inline copy is exactly how the election gets passed through as
        // the role: it encodes cleanly and attaches the wrong KIND of provider.
        const payRole = payRoleForElection(effective);
        return {
          currencyCode: Number(e.currencyCode),
          currencyName: e.currencySymbol || String(e.currencyCode),
          election: effective,
          payRole,
          payRoleName: payRole === 2 ? 'Minter' : 'Rail',
        };
      })
      .filter((c: any) => c !== null);

    const chosen = await this.paymentProcessorModalService.show('',
      this.serviceParties().paymentProcessors.map(p => p.address), currencies as any);
    if (!chosen) return;

    this.loadingService.show(this.translate.instant('common.updating'));
    try {
      const res = await this.apiService.vaultAttachPaymentProvider(
        address, chosen.provider, chosen.currencyCode, chosen.payRole);
      if ((res as any)?.error) {
        this.alertService.info(this.translate.instant('alerts.updateFailed'), (res as any).error);
        return;
      }
      await this.getServiceDetails();
      await this.getElections();
      if ((res as any)?.requestId) {
        this.alertService.info(this.translate.instant('approvals.submittedTitle'),
          this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
      }
    } catch (error) {
      console.error('Failed to attach payment provider', error);
      this.alertService.info(this.translate.instant('alerts.updateFailed'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  async attachClearingHouse() {
    const chosen = await this.clearingHouseModalService.show('',
      this.serviceParties().clearingHouses.map(p => p.address));
    if (!chosen) return;
    // Role 5 — the SAME id the curated set and the Regulators Registry use.
    await this._attachParty(5, chosen);
  }

  async attachCustodian() {
    const currentService = this.service();
    if (!currentService) return;
    // The attached list stores self-custody as the service's OWN address, which the picker
    // reads to drop the Self-custody option once it is taken.
    const chosen = await this.custodianModalService.show(currentService.address, '', currentService.regulator,
      this.serviceParties().custodians.map(p => p.address));
    if (!chosen) return;
    // ⚠️ Role 4 — this passed the literal 3, the PRE-SPLIT id for Custodian. Since BANK was
    // inserted at 3, `partyAttach` checked `isPartyFor(regulator, party, 3)` against a class-4
    // custodian and ALWAYS reverted "party not authorised for regulator" — attaching a custodian
    // from this page could never succeed. `attachClearingHouse` directly above was corrected to 5
    // and this one was missed, which is why the constant is used here now.
    await this._attachParty(PARTY_CLASS.CUSTODIAN, chosen);
  }

  // Self-custody sentinel detection for the custodian list label.
  isSelfCustodyAddress(party: string): boolean {
    const s = this.service();
    return !!s && party.toLowerCase() === s.address.toLowerCase();
  }

  async openChangeValidatorModal() {
    const currentService = this.service();
    if (!currentService) return;

    const newValidator = await this.validatorModalService.show(currentService.validator, currentService.verificationLevel);
    if (newValidator === null) return;

    const zeroAddr = '0x0000000000000000000000000000000000000000';
    const currentNormalized = (currentService.validator && currentService.validator !== zeroAddr) ? currentService.validator : '';
    if (newValidator === currentNormalized) return;

    this.loadingService.show(this.translate.instant('services.details.loadingMsgs.updatingValidator'));
    try {
      await this.apiService.vaultSetServiceValidator(currentService.address, newValidator);
      await this.getServiceDetails();
    } catch (error) {
      console.error('Failed to change validator', error);
      this.alertService.info(this.translate.instant('alerts.updateFailed'), this.translate.instant('services.details.info.updateValidatorError'));
    } finally {
      this.loadingService.hide();
    }
  }

  // `openChangePaymentProcessorModal` was DELETED (2026-08-23). It had no template caller and was
  // doubly wrong: it routed through `vaultSetServicePaymentProcessor` -> `_replaceServiceParty` ->
  // `POST /services/:address/parties`, i.e. the `partyAttach` path, whose payment role sets are
  // RETIRED — and `_replaceServiceParty` additionally DETACHES every other row in the payment
  // bucket, so a "change" would silently drop the service's other currencies' providers.
  // A payment provider attaches per CURRENCY via `attachPaymentProcessor()` above; there is no
  // "the service's payment processor" to change.

  async openChangeCustodianModal() {
    const currentService = this.service();
    if (!currentService) return;

    const newCustodian = await this.custodianModalService.show(
      currentService.address,
      currentService.custodian,
      currentService.regulator,
    );
    if (newCustodian === null) return;

    // Normalize: treat the self-custody sentinel as a distinct selection.
    // We send what the user picked (either the sentinel or an external address) straight to the API.
    const zeroAddr = '0x0000000000000000000000000000000000000000';
    const currentNormalized = (currentService.custodian && currentService.custodian !== zeroAddr) ? currentService.custodian : '';
    if (newCustodian === currentNormalized) return;

    this.loadingService.show(this.translate.instant('services.details.loadingMsgs.updatingCustodian'));
    try {
      const res = await this.apiService.vaultSetServiceCustodian(currentService.address, newCustodian);
      await this.getServiceDetails();
      if (res?.requestId) {
        this.alertService.info(this.translate.instant('approvals.submittedTitle'), this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
      }
    } catch (error) {
      console.error('Failed to change custodian', error);
      this.alertService.info(this.translate.instant('alerts.updateFailed'), this.translate.instant('services.details.info.updateCustodianError'));
    } finally {
      this.loadingService.hide();
    }
  }

  // Venue-side per-(this service, asset) fee config (Phase B, all-flows).
  // Stacks on top of the asset issuer's own cut on every credit-settled flow.
  async openVenueFeeConfigModal(assetAddress: string, assetSymbol: string) {
    const currentService = this.service();
    if (!currentService) return;
    const res = await this.apiService.vaultGetServiceFeeConfig(currentService.address, assetAddress);
    // A null `res` is a FAILED READ, not "no fee is configured" — `vaultGet` returns null for a
    // transport failure and for any body that isn't the success envelope. Opening the modal on it
    // would show None/None over a live override and let one Save replace it, so refuse instead.
    if (!res) {
      this.alertService.info(
        this.translate.instant('alerts.error'),
        this.translate.instant('services.details.info.loadVenueFeeConfigError'));
      return;
    }
    const result = await this.feeConfigModal.show({
      service: currentService.address,
      serviceName: currentService.name,
      mode: 'asset',
      asset: assetAddress,
      assetSymbol,
      feeConfig: res.feeConfig,
      // Both are load-bearing, not decoration: without `isSet` the modal's `inheriting` flag is
      // false (`undefined === false`), which DEFEATS its "opening and saving an inherited row must
      // not silently pin an override" guard — and an all-None override does not mean "inherit", it
      // means "this asset is free" and outranks the service default. `inherited` is what lets the
      // operator see what is actually being charged meanwhile.
      inherited: res.default,
      isSet: res.isSet,
    });
    if (!result) return;
    this.loadingService.show(this.translate.instant('services.details.loadingMsgs.savingVenueFeeConfig'));
    try {
      const r = await this.apiService.vaultSetServiceFeeConfig(currentService.address, assetAddress, result.feeConfig);
      if ((r as any)?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), (r as any).error);
        return;
      }
      await this.getServiceDetails();
    } finally {
      this.loadingService.hide();
    }
  }

  async gotoValidator(validator: string) {
    this.router.navigate(['/authorized/validators/details/' + validator]);
  }

  async gotoSubscriber(subscription: string) {
    this.router.navigate(['/authorized/subscriptions/details/' + subscription]);
  }

  getTrxTypeClass(trxType: string): string {
    switch (trxType) {
      case 'Subscribe': return 'bg-green-100 text-green-800';
      case 'Redeem':    return 'bg-orange-100 text-orange-800';
      default:          return 'bg-gray-100 text-gray-800';
    }
  }

  async getTransactions(start: number, offset: number, silent = false) {
    if (!silent) this.loadingService.show(this.translate.instant('common.loadingData'));
    const data = await this.apiService.vaultGetTransactions({ service: this.serviceAddress }, start - 1, offset);
    if (data?.transactions) this.transactions.set(data.transactions.map((t: any) => this.mapVaultTransaction(t)));
    this.trxPage.set(1);
    if (!silent) this.loadingService.hide();
  }

  async getLiquidity(silent = false) {
    if (!silent) this.liquidityLoading.set(true);
    try {
      const data = await this.apiService.vaultGetServiceLiquidity(this.serviceAddress);
      this.liquidityBalances.set(Array.isArray(data?.balances) ? data.balances : []);
      this.shortfallTolerance.set(data?.shortfallTolerance ?? null);
      this.shortfallToleranceIsSet.set(!!data?.shortfallToleranceIsSet);
    } finally {
      if (!silent) this.liquidityLoading.set(false);
    }
    this.getLiquidityHistory(silent);
  }

  async getLiquidityHistory(silent = false) {
    if (!silent) this.liquidityHistoryLoading.set(true);
    try {
      const res = await this.apiService.vaultGetServiceCreditTransactions(this.serviceAddress, { origin: '3,4', offset: 200 });
      this.liquidityHistory.set(Array.isArray(res.transactions) ? res.transactions : []);
    } finally {
      if (!silent) this.liquidityHistoryLoading.set(false);
    }
  }

  openLiquidityModal(action: 'inject' | 'withdraw', row: { currencyCode: number; currencyName: string; currencySymbol: string; available: number }) {
    this.liquidityModalAction.set(action);
    this.liquidityModalCurrency.set({ code: row.currencyCode, name: row.currencyName, symbol: row.currencySymbol });
    this.liquidityModalAvailable.set(Number(row.available || 0));
    this.liquidityModalAmount.set('');
    this.liquidityModalRefNo.set('');
    this.liquidityModalError.set('');
    this.liquidityModalSubmitting.set(false);
    this.liquidityModalOpen.set(true);
  }

  closeLiquidityModal() {
    if (this.liquidityModalSubmitting()) return;
    this.liquidityModalOpen.set(false);
  }

  async submitLiquidity() {
    const cur = this.liquidityModalCurrency();
    const amt = Number(this.liquidityModalAmount());
    if (!cur || !Number.isFinite(amt) || amt <= 0) {
      this.liquidityModalError.set(this.translate.instant('services.details.liquidity.errors.positiveAmount'));
      return;
    }
    this.liquidityModalSubmitting.set(true);
    this.liquidityModalError.set('');
    try {
      // ⚠️ INJECT ONLY. The withdraw half is gone: the bare pool drain has no on-chain call
      // left (S37/S78), and money leaves a pool through the withdrawal lifecycle instead. The
      // reference is now REQUIRED and named `providerTrxRefNo` — an injection is a deposit into
      // the pool, so it must say which transfer funded it.
      const ref = this.liquidityModalRefNo().trim();
      if (!ref) {
        this.liquidityModalError.set(this.translate.instant('services.details.liquidity.errors.refRequired'));
        this.liquidityModalSubmitting.set(false);
        return;
      }
      const body: any = { currencyCode: cur.code, amount: amt, providerTrxRefNo: ref };
      const result = await this.apiService.vaultServiceLiquidityInject(this.serviceAddress, body);
      if (!result || result.error || result.type === 'error') {
        this.liquidityModalError.set(result?.error || this.translate.instant('alerts.failed'));
      } else {
        this.liquidityModalOpen.set(false);
        await this.getLiquidity();
      }
    } catch (e: any) {
      this.liquidityModalError.set(e?.message || this.translate.instant('alerts.failed'));
    } finally {
      this.liquidityModalSubmitting.set(false);
    }
  }

  clearAssetFilters() {
    this.filterAssetName.set('');
    this.filterAssetState.set('');
    this.assetPage.set(1);
  }

  exportAssetsExcel() {
    const svcName = this.service()?.name ?? 'service';
    const rows = this.filteredAssets().map(a => ({
      'Name': a.name,
      'Symbol': a.symbol,
      'Issuer': a.issuerName,
      'Class': a.assetClassName,
      'State': a.stateName,
      'Suspended': a.suspended ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assets');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `assets_${svcName}_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'service_assets');
  }

  exportAssetsPdf() {
    const svcName = this.service()?.name ?? 'Service';
    const assetsList = this.filteredAssets();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Assets — ${svcName}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const filterParts = [
      `Name: ${this.filterAssetName() || 'None'}`,
      `State: ${this.filterAssetState() || 'None'}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Filters: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [[
        { content: '#' },
        { content: 'Name' },
        { content: 'Symbol' },
        { content: 'Issuer' },
        { content: 'Type' },
        { content: 'State' },
      ]],
      body: assetsList.map((a, i) => [
        i + 1,
        a.name,
        a.symbol,
        a.issuerName,
        a.assetClassName,
        a.suspended ? `${a.stateName} (Suspended)` : a.stateName,
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`assets_${svcName}_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'service_assets');
  }

  clearSubFilters() {
    this.filterSubAddress.set('');
    this.filterSubState.set('');
    this.subPage.set(1);
  }

  exportSubsExcel() {
    const svcName = this.service()?.name ?? 'service';
    const rows = this.filteredSubscriptions().map(s => ({
      'Date': this.utils.formatDate(s.createdAt),
      'Subscription': s.subscription,
      'State': s.stateName,
      'Suspended': s.suspended ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subscriptions');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `subscriptions_${svcName}_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'service_subscriptions');
  }

  exportSubsPdf() {
    const svcName = this.service()?.name ?? 'Service';
    const subs = this.filteredSubscriptions();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Subscriptions — ${svcName}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const filterParts = [
      `Address: ${this.filterSubAddress() || 'None'}`,
      `State: ${this.filterSubState() || 'None'}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Filters: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [[
        { content: '#' },
        { content: 'Date' },
        { content: 'Subscription' },
        { content: 'State' },
      ]],
      body: subs.map((s, i) => [
        i + 1,
        this.utils.formatDate(s.createdAt),
        s.subscription,
        s.suspended ? `${s.stateName} (Suspended)` : s.stateName,
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`subscriptions_${svcName}_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'service_subscriptions');
  }

  clearTrxFilters() {
    this.filterTrxType.set('');
    this.filterTrxAsset.set('');
    this.filterTrxSubscription.set('');
    this.filterTrxCurrency.set('');
    this.filterTrxStartDate.set('');
    this.filterTrxEndDate.set('');
    this.trxPage.set(1);
  }

  exportTrxExcel() {
    const svcName = this.service()?.name ?? 'service';
    const rows = this.filteredTrxs().map(t => ({
      'Time': this.utils.formatDate(t.time),
      'Type': t.trxType,
      'Asset': `${t.assetName} (${t.assetSymbol})`,
      'Subscription': t.subscription,
      'Tokens': t.tokens,
      'Currency': t.currencyCode,
      'Price': this.utils.roundMoney(t.price),
      'Total': this.utils.roundMoney(t.totalPrice),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `transactions_${svcName}_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'service_transactions');
  }

  exportTrxPdf() {
    const svcName = this.service()?.name ?? 'Service';
    const txs = this.filteredTrxs();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Transactions — ${svcName}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    // ── filters line ──────────────────────────────────────────────
    const assetLabel = this.filterTrxAsset()
      ? (this.uniqueTrxAssets().find(a => a[0] === this.filterTrxAsset())?.[1] ?? this.filterTrxAsset())
      : 'None';
    const filterParts = [
      `Service: ${svcName}`,
      `Type: ${this.filterTrxType() || 'None'}`,
      `Asset: ${assetLabel}`,
      `Subscription: ${this.filterTrxSubscription() || 'None'}`,
      `From: ${this.filterTrxStartDate() || 'None'}`,
      `To: ${this.filterTrxEndDate() || 'None'}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Filters: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    const subs   = txs.filter(t => t.trxType === 'Subscribe');
    const redeem = txs.filter(t => t.trxType === 'Redeem');
    const sumTokens = (arr: typeof txs) => arr.reduce((s, t) => s + Number(t.tokens), 0);
    const sumTotal  = (arr: typeof txs) => arr.reduce((s, t) => s + Number(t.totalPrice), 0);

    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      head: [[
        { content: 'Type' },
        { content: 'Count',         styles: { halign: 'center' } },
        { content: 'Assets',        styles: { halign: 'center' } },
        { content: 'Subscriptions', styles: { halign: 'center' } },
        { content: 'Tokens',        styles: { halign: 'right'  } },
        { content: 'Value',         styles: { halign: 'right'  } },
      ]],
      body: [
        ['Subscribe', subs.length,   new Set(subs.map(t => t.asset)).size,   new Set(subs.map(t => t.subscription)).size,   this.utils.formatTokens(sumTokens(subs)),   this.utils.formatPrice(sumTotal(subs))],
        ['Redeem',    redeem.length,  new Set(redeem.map(t => t.asset)).size, new Set(redeem.map(t => t.subscription)).size, this.utils.formatTokens(sumTokens(redeem)), this.utils.formatPrice(sumTotal(redeem))],
      ],
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: { 0: { cellWidth: 10 }, 5: { halign: 'center' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
      head: [[
        { content: '#' },
        { content: 'Time' },
        { content: 'Type' },
        { content: 'Asset' },
        { content: 'Subscription' },
        { content: 'Currency', styles: { halign: 'center' } },
        { content: 'Tokens',   styles: { halign: 'right'  } },
        { content: 'Price',    styles: { halign: 'right'  } },
        { content: 'Total',    styles: { halign: 'right'  } },
      ]],
      body: txs.map((t, i) => [
        i + 1,
        this.utils.formatDate(t.time),
        t.trxType,
        `${t.assetName} (${t.assetSymbol})`,
        t.subscription,
        t.currencyCode,
        this.utils.formatTokens(t.tokens),
        this.utils.formatPrice(t.price),
        this.utils.formatPrice(t.totalPrice),
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`transactions_${svcName}_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'service_transactions');
  }

  openTransactionInfo(trx: AssetTransaction) {
    this.trxInfoService.show(trx);
    this.auditService.logView('transaction', { id: trx.trxId });
  }

}
