import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { Subscription as RxSubscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { ApiService } from '../../../../shared/services/api.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { AssetTransaction, CreditBalance, CreditTransaction, RegulatorHold, Subscription, SubscriptionHolding, User } from '../../../../shared/models/data.model';
import { AuthService } from '../../../../shared/services/auth.service';
import { applyPdfFooter } from '../../../../shared/utils/pdf-export.utils';
import { ModalSubscriptionStateService } from '../modals/modal-subscription-state/modal-subscription-state.service';
import { ModalSubscriptionStateComponent } from "../modals/modal-subscription-state/modal-subscription-state.component";
import { ModalTransactionInfoService } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.service';
import { ModalTransactionInfoComponent } from '../../../../shared/components/modal-transaction-info/modal-transaction-info.component';
import { ModalCreditTrxInfoService } from '../../../../shared/components/modal-credit-trx-info/modal-credit-trx-info.service';
import { ModalCreditTrxInfoComponent } from '../../../../shared/components/modal-credit-trx-info/modal-credit-trx-info.component';
import { ModalCreditDepositService } from '../modals/modal-credit-deposit/modal-credit-deposit.service';
import { ModalCreditDepositComponent } from '../modals/modal-credit-deposit/modal-credit-deposit.component';
import { ModalSellWithdrawService } from '../modals/modal-sell-withdraw/modal-sell-withdraw.service';
import { ModalSellWithdrawComponent } from '../modals/modal-sell-withdraw/modal-sell-withdraw.component';
import { SocketService } from '../../../../shared/services/socket.service';
import { AuditService } from '../../../../shared/services/audit.service';
import { DocumentsTabComponent } from '../../../../shared/components/documents-tab/documents-tab.component';
import { LiveIndicatorComponent } from '../../../../shared/components/live-indicator/live-indicator.component';
import { FeaturesService } from '../../../../shared/services/features.service';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { PaginatorComponent, pageSlice } from '../../../../shared/components/paginator/paginator.component';



@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    RouterLink,
    ModalSubscriptionStateComponent,
    ModalTransactionInfoComponent,
    ModalCreditTrxInfoComponent,
    ModalCreditDepositComponent,
    ModalSellWithdrawComponent,
    DocumentsTabComponent,
    LiveIndicatorComponent, TranslatePipe, MoneyPipe,
    PaginatorComponent,
  ]
})
export class DetailsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private subscriptionStateService = inject(ModalSubscriptionStateService);
  private creditDepositService = inject(ModalCreditDepositService);
  private sellWithdrawService = inject(ModalSellWithdrawService);
  trxInfoService = inject(ModalTransactionInfoService);
  creditTrxInfoService = inject(ModalCreditTrxInfoService);
  utils = inject(UtilsService);
  private socketService = inject(SocketService);
  private authService = inject(AuthService);
  private auditService = inject(AuditService);
  features = inject(FeaturesService);
  private translate = inject(TranslateService);

  userInfo!: User;
  get entityActive() { return this.authService.entityActive(); }
  private _socketSub: RxSubscription | null = null;

  activeTab = signal<'overview' | 'info' | 'holdings' | 'trxs' | 'credit' | 'docs' | 'identity'>('overview');

  // ── Identity Data (own-originated eKYC verifications — unified-eKYC §2.4) ──────
  // Lists the verifications THIS entity originated for the subscriber's identity and
  // renders the decrypted canonical + ID images. Foreign-originated verifications never
  // appear (no DEK for this tenant); the DID number is never present.
  identityHash = signal<string | null>(null);
  ekycVerifications = signal<{ transactionId: string; documentId: number; sharedAt: number | null }[]>([]);
  ekycLoaded = signal(false);
  ekycLoading = signal(false);
  ekycSelected = signal<string | null>(null);
  ekycDetail = signal<any | null>(null);
  ekycImages = signal<{ front: string | null; back: string | null } | null>(null);

  loadingData: boolean = false;
  refreshing = signal(false);

  subscriptionAddress = '';
  subscription = signal<Subscription | undefined>(undefined);
  /**
   * Has the owning SERVICE declared straight-through transactions (Phase 21)? Drives the
   * optional "Buy with deposit" section in the deposit modal and the Sell & Withdraw button.
   * Read from the service row's projected boolean, never from metadata JSON.
   */
  straightThrough = signal(false);
  suspensionReason = signal<string>('');
  holdings = signal<SubscriptionHolding[]>([]);
  holdingPage = signal(1);
  holdingPageSize = signal(25);

  // holdings filters
  filterHoldingAsset = signal<string>('');
  filterHoldingBalanceOp = signal<'' | 'gt' | 'lt'>('');
  filterHoldingBalanceAmt = signal<number | null>(null);
  filterHoldingCurrency = signal<string>('');

  uniqueHoldingAssets = computed(() =>
    [...new Map(this.holdings().map(h => [h.asset, `${h.assetName} (${h.assetSymbol})`])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  uniqueHoldingCurrencies = computed(() =>
    [...new Set(this.holdings().map(h => h.currencyCode).filter(Boolean))].sort()
  );

  filteredHoldings = computed(() => {
    const asset = this.filterHoldingAsset();
    const currency = this.filterHoldingCurrency();
    const op = this.filterHoldingBalanceOp();
    const amt = this.filterHoldingBalanceAmt();
    return this.holdings().filter(h => {
      if (asset && h.asset !== asset) return false;
      if (currency && h.currencyCode !== currency) return false;
      if (op && amt !== null) {
        if (op === 'gt' && h.balance <= amt) return false;
        if (op === 'lt' && h.balance >= amt) return false;
      }
      return true;
    });
  });

  pagedHoldings = computed(() => pageSlice(this.filteredHoldings(), this.holdingPage(), this.holdingPageSize()));

  transactions = signal<AssetTransaction[]>([]);
  trxPage = signal(1);
  trxPageSize = signal(25);

  // filters
  filterType = signal<string>('');
  filterAsset = signal<string>('');
  filterTokensOp = signal<'' | 'gt' | 'lt'>('');
  filterTokensAmt = signal<number | null>(null);
  filterStartDate = signal<string>('');
  filterEndDate = signal<string>('');
  filterCurrency = signal<string>('');

  uniqueAssets = computed(() =>
    [...new Map(this.transactions().map(t => [t.asset, `${t.assetName} (${t.assetSymbol})`])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  uniqueCurrencies = computed(() =>
    [...new Set(this.transactions().map(t => t.currencyCode).filter(Boolean))].sort()
  );

  filteredTransactions = computed(() => {
    const type = this.filterType();
    const asset = this.filterAsset();
    const currency = this.filterCurrency();
    const op = this.filterTokensOp();
    const amt = this.filterTokensAmt();
    const startTs = this.filterStartDate() ? Math.floor(new Date(this.filterStartDate()).getTime() / 1000) : 0;
    const endTs   = this.filterEndDate()   ? Math.floor(new Date(this.filterEndDate()).getTime()   / 1000) + 86399 : Infinity;
    return this.transactions().filter(t => {
      if (type && t.trxType !== type) return false;
      if (asset && t.asset !== asset) return false;
      if (currency && t.currencyCode !== currency) return false;
      if (op && amt !== null) {
        if (op === 'gt' && t.tokens <= amt) return false;
        if (op === 'lt' && t.tokens >= amt) return false;
      }
      if (t.time < startTs || t.time > endTs) return false;
      return true;
    });
  });

  pagedTransactions = computed(() => pageSlice(this.filteredTransactions(), this.trxPage(), this.trxPageSize()));

  // overview computed signals
  totalPortfolioValue = computed(() => this.utils.round6(this.holdings().reduce((sum, h) => sum + h.balance * h.currentBid, 0)));
  totalCostBasis = computed(() => this.utils.round6(this.holdings().reduce((sum, h) => sum + h.cost, 0)));
  totalPL = computed(() => this.utils.round6(this.totalPortfolioValue() - this.totalCostBasis()));
  totalPLPct = computed(() => {
    const cost = this.totalCostBasis();
    return cost > 0 ? (this.totalPL() / cost) * 100 : null;
  });

  holdingsByCurrency = computed(() => {
    const map = new Map<string, { marketValue: number; cost: number }>();
    for (const h of this.holdings()) {
      const cc = h.currencyCode || '—';
      const existing = map.get(cc) ?? { marketValue: 0, cost: 0 };
      map.set(cc, {
        marketValue: existing.marketValue + h.balance * h.currentBid,
        cost: existing.cost + h.cost,
      });
    }
    return [...map.entries()].map(([cc, v]) => {
      const pl = this.utils.round6(v.marketValue - v.cost);
      return {
        currencyCode: cc,
        marketValue: this.utils.round6(v.marketValue),
        cost: this.utils.round6(v.cost),
        pl,
        plPct: v.cost > 0 ? pl / v.cost * 100 : null,
      };
    });
  });
  subscribeCount = computed(() => this.transactions().filter(t => t.trxType === 'Subscribe').length);
  redeemCount = computed(() => this.transactions().filter(t => t.trxType === 'Redeem').length);
  lastTrx = computed(() => {
    const t = this.transactions();
    if (!t || t.length === 0) return null;
    return [...t].sort((a, b) => b.time - a.time)[0];
  });

  // credit tab state
  creditBalances = signal<CreditBalance[]>([]);
  creditTransactions = signal<CreditTransaction[]>([]);
  creditTrxPage = signal(1);
  creditTrxPageSize = signal(25);

  filterCreditType = signal<string>('');
  filterCreditCurrency = signal<string>('');
  filterCreditAmountOp = signal<'' | 'gt' | 'lt'>('');
  filterCreditAmountVal = signal<number | null>(null);
  filterCreditStartDate = signal<string>('');
  filterCreditEndDate = signal<string>('');

  activeCreditBalances = computed(() => this.creditBalances().filter(b => b.balance > 0));

  uniqueCreditCurrencies = computed(() =>
    [...new Set(this.creditTransactions().map(t => t.currencySymbol).filter(Boolean))].sort()
  );

  filteredCreditTransactions = computed(() => {
    const type = this.filterCreditType();
    const currency = this.filterCreditCurrency();
    const op = this.filterCreditAmountOp();
    const amt = this.filterCreditAmountVal();
    const startTs = this.filterCreditStartDate() ? Math.floor(new Date(this.filterCreditStartDate()).getTime() / 1000) : 0;
    const endTs   = this.filterCreditEndDate()   ? Math.floor(new Date(this.filterCreditEndDate()).getTime()   / 1000) + 86399 : Infinity;
    return this.creditTransactions().filter(t => {
      if (type && t.trxTypeName !== type) return false;
      if (currency && t.currencySymbol !== currency) return false;
      if (op && amt !== null) {
        if (op === 'gt' && t.amount <= amt) return false;
        if (op === 'lt' && t.amount >= amt) return false;
      }
      if (t.startTime < startTs || t.startTime > endTs) return false;
      return true;
    });
  });

  pagedCreditTransactions = computed(() => pageSlice(this.filteredCreditTransactions(), this.creditTrxPage(), this.creditTrxPageSize()));

  // change-highlight signals (cleared 2s after a silent refresh)
  newHoldingKeys      = signal<Set<string>>(new Set());
  newTrxIds           = signal<Set<number>>(new Set());
  newCreditTrxIds     = signal<Set<number>>(new Set());
  changedCreditCodes  = signal<Set<number>>(new Set());
  private flashHoldingKeys(keys: string[])   { if (!keys.length) return; this.newHoldingKeys.set(new Set(keys));     setTimeout(() => this.newHoldingKeys.set(new Set()),     2000); }
  private flashTrxIds(ids: number[])         { if (!ids.length)  return; this.newTrxIds.set(new Set(ids));           setTimeout(() => this.newTrxIds.set(new Set()),         2000); }
  private flashCreditTrxIds(ids: number[])   { if (!ids.length)  return; this.newCreditTrxIds.set(new Set(ids));     setTimeout(() => this.newCreditTrxIds.set(new Set()),   2000); }
  private flashCreditCodes(codes: number[])  { if (!codes.length) return; this.changedCreditCodes.set(new Set(codes)); setTimeout(() => this.changedCreditCodes.set(new Set()), 2000); }

  constructor() { 
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.subscriptionAddress = address;
    }    
  }

  async ngOnInit() {}
  
  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.activeTab.set('overview');
    await this.reload();
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.reload(true));
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }

  private async reload(silent = false) {
    if (silent) this.refreshing.set(true);
    try {
      await this.getSubscriptionDetails(silent);
      const tasks: Promise<any>[] = [
        this.getHoldings(1, 500, silent),
        this.getTransactions(1, 500, silent),
        this.getCreditBalances(silent),
      ];
      if (silent && this.activeTab() === 'credit') tasks.push(this.refreshCreditTransactions(silent));
      await Promise.all(tasks);
    } finally {
      if (silent) this.refreshing.set(false);
    }
  }

  private async refreshCreditTransactions(silent = false) {
    const trxData = await this.apiService.vaultGetSubscriptionCreditTransactions(this.subscriptionAddress, 1, 50);
    if (trxData?.transactions) {
      const mapped = trxData.transactions.map((t: any) => this.mapCreditTransaction(t));
      /*
          ⚠️ THE `trxId` TIE-BREAK IS LOAD-BEARING — WITHOUT IT THE ROWS READ BACKWARDS.

          `startTime` is SECOND resolution, and one buy writes THREE rows in a single
          transaction: the service's Withhold, then the Transfer to the issuer, then the fee
          leg. All three carry the same second, so sorting on `startTime` alone leaves them
          tied — and `Array.prototype.sort` is STABLE, so a tie preserves the order they
          ARRIVED in. This endpoint reads live chain (`creditEntityAccountTransactions`) and
          returns ASCENDING trx_id, so the group rendered oldest-first inside a newest-first
          list: the Withhold appeared ABOVE the transfers it funded, reading as though the
          money was held AFTER it had already moved.

          🔴 Sorting "correctly" by the visible field is exactly what hides this — the dates
          are right, the arithmetic is right, and only the ORDER is wrong. Reported by a
          reader of the Credit tab, not by any test.

          ⚠️ Do not "simplify" this back to a single-key sort, and do not rely on the API:
          the mirror query orders `start_time DESC, trx_id DESC`, but this tab does not use
          the mirror.
      */
      mapped.sort((a: CreditTransaction, b: CreditTransaction) =>
        (b.startTime - a.startTime) || (Number(b.trxId) - Number(a.trxId)));
      if (silent) {
        const prevIds = new Set(this.creditTransactions().map(t => t.trxId));
        this.flashCreditTrxIds(mapped.filter((t: CreditTransaction) => !prevIds.has(t.trxId)).map((t: CreditTransaction) => t.trxId));
      }
      this.creditTransactions.set(mapped);
    }
  }

  setTab(tab: 'overview' | 'info' | 'holdings' | 'trxs' | 'credit' | 'docs' | 'identity') {
    this.activeTab.set(tab);
    if (tab === 'info') this.getSubscriptionDetails();
    if (tab === 'holdings') this.getHoldings(1, 500);
    if (tab === 'trxs') this.getTransactions(1, 500);
    if (tab === 'credit') this.getCreditData();
    if (tab === 'identity') this.loadIdentityData();
  }

  // ── Identity Data loaders (own-originated verifications only) ─────────────────
  async loadIdentityData() {
    // The API 403s without `view-identity-data`; skip the call rather than fire a request
    // we know is denied (setTab can still be reached by a stale deep link).
    if (!this.features.systemFunctionEnabled('view-identity-data')) return;
    if (this.ekycLoaded()) return;
    this.ekycLoading.set(true);
    try {
      let hash = this.identityHash();
      if (!hash) {
        hash = await this.apiService.vaultGetSubscriptionIdentityHash(this.subscriptionAddress);
        this.identityHash.set(hash);
      }
      if (hash) {
        this.ekycVerifications.set(await this.apiService.ekycVerifications(hash));
      }
      this.ekycLoaded.set(true);
    } finally {
      this.ekycLoading.set(false);
    }
  }

  async openEkycVerification(transactionId: string) {
    if (this.ekycSelected() === transactionId) { this.ekycSelected.set(null); this.ekycDetail.set(null); this.ekycImages.set(null); return; }
    this.ekycSelected.set(transactionId);
    this.ekycDetail.set(null);
    this.ekycImages.set(null);
    this.ekycLoading.set(true);
    try {
      const hash = this.identityHash() ?? undefined;
      const detail = await this.apiService.ekycTransaction(transactionId, hash ?? undefined);
      this.ekycDetail.set(detail?.status ? detail : null);
      const imgs = await this.apiService.ekycImages(transactionId, hash ?? undefined);
      if (imgs?.status && imgs.data) {
        this.ekycImages.set({
          front: imgs.data.front_img ? 'data:image/jpeg;base64,' + imgs.data.front_img : null,
          back:  imgs.data.back_img  ? 'data:image/jpeg;base64,' + imgs.data.back_img  : null,
        });
      }
    } finally {
      this.ekycLoading.set(false);
    }
  }

  // Canonical fields worth rendering, in display order (null values are skipped in the template).
  readonly ekycDisplayFields: { key: string; label: string }[] = [
    { key: 'nameFull', label: 'subscriptions.details.identity.nameFull' },
    { key: 'idNumber', label: 'subscriptions.details.identity.idNumber' },
    { key: 'dateOfBirth', label: 'subscriptions.details.identity.dateOfBirth' },
    { key: 'idExpiryDate', label: 'subscriptions.details.identity.idExpiryDate' },
    { key: 'nationality', label: 'subscriptions.details.identity.nationality' },
    { key: 'gender', label: 'subscriptions.details.identity.gender' },
    { key: 'addressStreet', label: 'subscriptions.details.identity.address' },
    { key: 'addressGovernorate', label: 'subscriptions.details.identity.governorate' },
  ];

  private readonly stateNames: Record<number, string> = {
    0: 'Inactive', 1: 'Initiated', 2: 'Active', 3: 'Suspended', 4: 'Deactivated',
  };

  private mapVaultSubscription(raw: any): Subscription {
    return {
      subscription: raw.address,
      entity: raw.entity ?? '',
      entityName: raw.entity_name ?? '',
      service: raw.service ?? '',
      serviceName: raw.service_name ?? raw.service ?? '',
      validator: raw.validator ?? '',
      validatorName: raw.validator_name ?? '',
      validatorVerificationId: Number(raw.validator_trx_ref ?? 0),
      validatorTimestamp: raw.validator_trx_ts ?? 0,
      regulator: raw.regulator ?? '',
      regulatorName: raw.regulator_name ?? '',
      createdAt: raw.created_at ?? 0,
      suspended: raw.suspended === true || raw.suspended === 1,
      state: raw.state ?? 0,
      stateName: raw.account_state_name ?? this.stateNames[raw.state] ?? String(raw.state ?? ''),
    } as Subscription;
  }

  private mapVaultHolding(raw: any): SubscriptionHolding {
    const balance  = Number(raw.balance ?? 0);
    const withheld = Number(raw.withheld ?? 0);
    return {
      asset: raw.asset ?? '',
      assetName: raw.asset_name ?? '',
      assetSymbol: raw.asset_symbol ?? '',
      currencyCode: raw.currency_code ?? '',
      balance,
      cost: raw.cost ?? 0,
      currentBid: raw.current_bid ?? 0,
      withheld,
      available: raw.available != null ? Number(raw.available) : balance - withheld,
    } as SubscriptionHolding;
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

  async getSubscriptionDetails(silent = false) {
    if (!silent) this.loadingService.show(this.translate.instant('common.loadingData'));
    const raw = await this.apiService.vaultGetSubscription(this.subscriptionAddress);
    if (raw) {
      const subscription = this.mapVaultSubscription(raw);
      this.subscription.set(subscription);
      if (subscription.suspended) {
        const logs = await this.apiService.vaultGetStateChangeLogs(subscription.subscription, 1, 1);
        if (logs?.logs?.length > 0) {
          this.suspensionReason.set(logs.logs[0].reason || '');
        }
      } else {
        this.suspensionReason.set('');
      }
      // Straight-through mode is a property of the SERVICE, not the subscription, so it has to
      // be read here for the Sell & Withdraw button to render at all. Non-fatal: a failed read
      // leaves the button hidden, which is the safe direction — the API would 409 the verb.
      if (subscription.service) {
        try {
          const service = await this.apiService.vaultGetService(subscription.service);
          this.straightThrough.set(service?.straight_through === true || service?.straightThrough === true);
        } catch { this.straightThrough.set(false); }
      }
    }
    if (!silent) this.loadingService.hide();
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
  
  async openChangeStateModal(){
    const currentService = this.subscription();
    if (!currentService) return;

    const modalResult = await this.subscriptionStateService.show(currentService.state);
    if (modalResult !== null && modalResult.state !== currentService.state) {
        this.loadingService.show(this.translate.instant('subscriptions.details.info.changingState'));
        try {
            const result = await this.apiService.vaultUpdateSubscriptionState(currentService.subscription, modalResult.state, modalResult.reason);
            if (result?.requestId) {
                this.alertService.info(
                  this.translate.instant('subscriptions.details.info.approvalSubmittedTitle'),
                  this.translate.instant('subscriptions.details.info.approvalSubmittedMessage'),
                  this.translate.instant('subscriptions.details.info.ok')
                );
            } else if (result) {
                this.subscription.update(sub => sub ? {
                    ...sub,
                    state: modalResult.state,
                    stateName: this.stateNames[modalResult.state] ?? String(modalResult.state),
                } : sub);
            }
        } catch (error) {
            console.error('Failed to change state', error);
        } finally {
            this.loadingService.hide();
        }
    }
  }

  getTrxTypeClass(trxType: string): string {
    switch (trxType) {
      case 'Subscribe': return 'bg-green-100 text-green-800';
      case 'Redeem':    return 'bg-orange-100 text-orange-800';
      default:          return 'bg-gray-100 text-gray-800';
    }
  }

  async getHoldings(start: number, offset: number, silent = false) {
    if (!silent) this.loadingService.show(this.translate.instant('common.loadingData'));
    const data = await this.apiService.vaultGetSubscriptionHoldings(this.subscriptionAddress, start - 1, offset);
    if (data?.holdings) {
      const next: SubscriptionHolding[] = data.holdings.map((h: any) => this.mapVaultHolding(h));
      // Enrich each holding with the regulator-hold summary in parallel. The
      // endpoint returns 0/0 quickly when there are no holds on the (asset, sub) pair.
      await Promise.all(next.map(async (h) => {
        try {
          const r = await this.apiService.vaultGetSubscriptionRegulatorHolds(this.subscriptionAddress, h.asset, 1, 1);
          h.regulatorHeld         = r?.heldRemaining ? Number(r.heldRemaining) : 0;
          h.regulatorActiveHolds  = r?.activeHolds   ? Number(r.activeHolds)   : 0;
          // Tighten `available` to reflect the freeze too (parity with the regulator dashboard).
          h.available = Math.max(0, h.balance - h.withheld - (h.regulatorHeld ?? 0));
        } catch {
          h.regulatorHeld = 0;
          h.regulatorActiveHolds = 0;
        }
      }));
      if (silent) {
        const prev = new Map(this.holdings().map(h => [h.asset, h.balance]));
        const changed: string[] = [];
        for (const h of next) {
          const prevBal = prev.get(h.asset);
          if (prevBal === undefined || prevBal !== h.balance) changed.push(h.asset);
        }
        this.flashHoldingKeys(changed);
      }
      this.holdings.set(next);
    }
    if (!silent) this.holdingPage.set(1);
    if (!silent) this.loadingService.hide();
  }

  // ── Regulator holds (read-only expandable row) ──────────────────────────────

  expandedHoldsAsset = signal<string | null>(null);
  holdsByAsset = signal<Record<string, RegulatorHold[]>>({});

  async toggleHoldsRow(h: SubscriptionHolding, ev: Event) {
    ev.stopPropagation();
    if (this.expandedHoldsAsset() === h.asset) {
      this.expandedHoldsAsset.set(null);
      return;
    }
    await this.loadHoldsForAsset(h.asset);
    this.expandedHoldsAsset.set(h.asset);
  }

  private async loadHoldsForAsset(asset: string) {
    try {
      const r = await this.apiService.vaultGetSubscriptionRegulatorHolds(this.subscriptionAddress, asset, 1, 200);
      const list: RegulatorHold[] = (r?.holds || []).map((x: any) => new RegulatorHold(
        x.assetAddress, Number(x.holdId), x.accountAddress,
        String(x.amount), String(x.released), String(x.remaining),
        Number(x.state), x.stateName || '', x.reason || '', x.releaseReason || '',
        Number(x.blockNumber || 0), Number(x.createdAt || 0), Number(x.lastUpdate || 0),
      ));
      this.holdsByAsset.update(m => ({ ...m, [asset]: list }));
    } catch (e) {
      console.error('Failed to load regulator holds', e);
      this.holdsByAsset.update(m => ({ ...m, [asset]: [] }));
    }
  }

  async gotoAsset(asset: string) {
    this.router.navigate(['/authorized/assets/details/' + asset]);
  }

  async getTransactions(start: number, offset: number, silent = false) {
    if (!silent) this.loadingService.show(this.translate.instant('common.loadingData'));
    const data = await this.apiService.vaultGetTransactions({ subscription: this.subscriptionAddress }, start - 1, offset);
    if (data?.transactions) {
      const next = data.transactions.map((t: any) => this.mapVaultTransaction(t));
      if (silent) {
        const prevIds = new Set(this.transactions().map(t => t.trxId));
        this.flashTrxIds(next.filter((t: AssetTransaction) => !prevIds.has(t.trxId)).map((t: AssetTransaction) => t.trxId));
      }
      this.transactions.set(next);
    }
    if (!silent) this.trxPage.set(1);
    if (!silent) this.loadingService.hide();
  }

  async gotoEntity(entity: string) {
    this.router.navigate(['/authorized/entities/details/' + entity]);
  }  

  async gotoService(service: string) {
    this.router.navigate(['/authorized/services/details/' + service]);
  }

  clearHoldingFilters() {
    this.filterHoldingAsset.set('');
    this.filterHoldingCurrency.set('');
    this.filterHoldingBalanceOp.set('');
    this.filterHoldingBalanceAmt.set(null);
    this.holdingPage.set(1);
  }

  clearFilters() {
    this.filterType.set('');
    this.filterAsset.set('');
    this.filterCurrency.set('');
    this.filterTokensOp.set('');
    this.filterTokensAmt.set(null);
    this.filterStartDate.set('');
    this.filterEndDate.set('');
    this.trxPage.set(1);
  }

  exportPdf() {
    const txs = this.filteredTransactions();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    const sub = this.subscription();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Transactions - ${sub?.subscription ?? ''}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const tokensOp = this.filterTokensOp();
    const tokensAmt = this.filterTokensAmt();
    const tokensLabel = tokensOp && tokensAmt !== null
      ? `${tokensOp === 'gt' ? '>' : '<'} ${tokensAmt}`
      : 'None';
    const assetLabel = this.filterAsset()
      ? (this.uniqueAssets().find(a => a[0] === this.filterAsset())?.[1] ?? this.filterAsset())
      : 'None';
    const filterParts = [
      `Type: ${this.filterType() || 'None'}`,
      `Asset: ${assetLabel}`,
      `Tokens: ${tokensLabel}`,
      `From: ${this.filterStartDate() || 'None'}`,
      `To: ${this.filterEndDate() || 'None'}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Filters: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    const subs = txs.filter(t => t.trxType === 'Subscribe');
    const redeem = txs.filter(t => t.trxType === 'Redeem');
    const sumTokens = (arr: typeof txs) => arr.reduce((s, t) => s + Number(t.tokens), 0);
    const sumTotal = (arr: typeof txs) => arr.reduce((s, t) => s + Number(t.totalPrice), 0);

    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      head: [[
        { content: 'Type' },
        { content: 'Count', styles: { halign: 'center' } },
        { content: 'Assets', styles: { halign: 'center' } },
        { content: 'Tokens', styles: { halign: 'right' } },
        { content: 'Value', styles: { halign: 'right' } },
      ]],
      body: [
        ['Subscribe', subs.length, new Set(subs.map(t => t.asset)).size, this.utils.formatTokens(sumTokens(subs)), this.utils.formatPrice(sumTotal(subs))],
        ['Redeem', redeem.length, new Set(redeem.map(t => t.asset)).size, this.utils.formatTokens(sumTokens(redeem)), this.utils.formatPrice(sumTotal(redeem))],
      ],
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: {
        0: { cellWidth: 10 },
        4: { halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
      },
      head: [[
        { content: '#' },
        { content: 'Time' },
        { content: 'Type' },
        { content: 'Asset' },
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
        t.currencyCode,
        this.utils.formatTokens(t.tokens),
        this.utils.formatPrice(t.price),
        this.utils.formatPrice(t.totalPrice),
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`subscription_transactions_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'subscription_transactions');
  }

  exportHoldingsPdf() {
    const holdings = this.filteredHoldings();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    const sub = this.subscription();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Holdings - ${sub?.subscription ?? ''}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const holdingBalanceOp = this.filterHoldingBalanceOp();
    const holdingBalanceAmt = this.filterHoldingBalanceAmt();
    const holdingBalanceLabel = holdingBalanceOp && holdingBalanceAmt !== null
      ? `${holdingBalanceOp === 'gt' ? '>' : '<'} ${holdingBalanceAmt}`
      : 'None';
    const holdingAssetLabel = this.filterHoldingAsset()
      ? (this.uniqueHoldingAssets().find(a => a[0] === this.filterHoldingAsset())?.[1] ?? this.filterHoldingAsset())
      : 'None';
    const filterParts = [
      `Asset: ${holdingAssetLabel}`,
      `Balance: ${holdingBalanceLabel}`,
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
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
      head: [[
        { content: 'Asset' },
        { content: 'Currency' },
        { content: 'Balance', styles: { halign: 'right' } },
        { content: 'Cost', styles: { halign: 'right' } },
        { content: 'Value', styles: { halign: 'right' } },
        { content: 'P/L', styles: { halign: 'right' } },
        { content: 'P/L %', styles: { halign: 'right' } },
      ]],
      body: holdings.map(h => {
        const value = this.utils.round6(h.balance * h.currentBid);
        const pl = this.utils.round6(value - h.cost);
        const plPct = h.cost > 0 ? (pl / h.cost * 100).toFixed(2) + '%' : '—';
        return [
          `${h.assetName}${h.assetSymbol ? ` (${h.assetSymbol})` : ''}`,
          h.currencyCode,
          this.utils.formatTokens(h.balance),
          this.utils.formatPrice(h.cost),
          this.utils.formatPrice(value),
          this.utils.formatPrice(pl),
          plPct,
        ];
      }),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`subscription_holdings_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'subscription_holdings');
  }

  exportHoldingsExcel() {
    const rows = this.filteredHoldings().map(h => {
      const value = this.utils.round6(h.balance * h.currentBid);
      const pl = this.utils.round6(value - h.cost);
      return {
        'Asset': `${h.assetName}${h.assetSymbol ? ` (${h.assetSymbol})` : ''}`,
        'Currency': h.currencyCode,
        'Balance': h.balance,
        'Cost': this.utils.roundMoney(h.cost),
        'Value': this.utils.roundMoney(value),
        'P/L': this.utils.roundMoney(pl),
        'P/L %': h.cost > 0 ? pl / h.cost * 100 : null,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Holdings');

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `subscription_holdings_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'subscription_holdings');
  }

  exportExcel() {
    const rows = this.filteredTransactions().map(t => ({
      'Time': this.utils.formatDate(t.time),
      'Type': t.trxType,
      'Asset': `${t.assetName} (${t.assetSymbol})`,
      'Tokens': t.tokens,
      'Currency': t.currencyCode,
      'Price': this.utils.roundMoney(t.price),
      'Total': this.utils.roundMoney(t.totalPrice),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

    const now = new Date();
    const stamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `subscription_transactions_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'subscription_transactions');
  }

  // ─── Credit ─────────────────────────────────────────────────────────────────

  private readonly creditTrxTypeNames: Record<number, string> = {
    1: 'Deposit', 2: 'Withdraw', 3: 'Transfer', 4: 'Withhold',
  };
  private readonly creditTrxStateNames: Record<number, string> = {
    1: 'Initiated', 2: 'Success', 3: 'Failed', 4: 'Cancelled',
  };
  // Mirrors the 'Credit Transaction Origin' VariablesProxy category — see
  // Tarmiiz Global Variables/Contracts/Global Variables/scripts/2.initiate.js.
  // Used as a fallback label; primary source is `originMap` populated from the API.
  private readonly creditOriginNames: Record<number, string> = {
    1: 'Deposit',
    2: 'Withdraw',
    3: 'Liquidity Inject',
    4: 'Liquidity Withdraw',
    5: 'Service Send',
    6: 'Service Withhold',
    7: 'Service Settle',
    8: 'Cross Service Settle',
    9: 'Peer To Peer',
    10: 'Regulator Transfer',
    11: 'Service Settle Fee',
    12: 'Cross Service Settle Fee',
    13: 'Bank Transfer',
    14: 'Identity Route',
  };
  private originMap: Record<number, string> = {};

  private mapCreditTransaction(raw: any): CreditTransaction {
    return {
      trxId: raw.trxId ?? 0,
      service: raw.service ?? '',
      serviceName: raw.serviceName ?? '',
      paymentProcessor: raw.paymentProcessor ?? '',
      paymentProcessorName: raw.paymentProcessorName ?? '',
      from: raw.from ?? '',
      fromName: raw.fromName ?? '',
      to: raw.to ?? '',
      toName: raw.toName ?? '',
      trxType: raw.trxType ?? 0,
      trxTypeName: this.creditTrxTypeNames[raw.trxType] ?? String(raw.trxType),
      currencyCode: raw.currencyCode ?? 0,
      currencySymbol: raw.currencySymbol ?? '',
      amount: raw.amount ?? 0,
      trxData: raw.trxData ?? '',
      trxState: raw.trxState ?? 0,
      trxStateName: this.creditTrxStateNames[raw.trxState] ?? String(raw.trxState),
      startTime: raw.startTime ?? 0,
      updateTime: raw.updateTime ?? 0,
      assetTrxId: Number(raw.assetTrxId ?? 0),
      origin: Number(raw.origin ?? 0),
      originName: this.originMap[raw.origin] ?? this.creditOriginNames[raw.origin] ?? (raw.origin ? `Origin #${raw.origin}` : ''),
      parentTrxId: Number(raw.parentTrxId ?? 0),
      trxRefNo: raw.trxRefNo ?? '',
      dataCid: raw.dataCid ?? '',
    } as CreditTransaction;
  }

  async getCreditBalances(silent = false) {
    const balances = await this.apiService.vaultGetSubscriptionCreditBalance(this.subscriptionAddress);
    if (balances) {
      if (silent) {
        const prev = new Map(this.creditBalances().map(b => [b.currencyCode, b.balance]));
        const changed: number[] = [];
        for (const b of balances) {
          const p = prev.get(b.currencyCode);
          if (p === undefined || p !== b.balance) changed.push(b.currencyCode);
        }
        this.flashCreditCodes(changed);
      }
      this.creditBalances.set(balances);
    }
  }

  async openCreditDeposit() {
    const sub = this.subscription();
    if (!sub) return;
    if (!sub.service) {
      await this.alertService.info(
        this.translate.instant('subscriptions.details.credit.errorTitle'),
        this.translate.instant('subscriptions.details.credit.noTokenIssuerService')
      );
      return;
    }
    const service = await this.apiService.vaultGetService(sub.service);
    const paymentProcessor = service?.payment_processor || service?.paymentProcessor || '';
    const currencies = this.creditBalances();
    if (currencies.length === 0) {
      await this.alertService.info(
        this.translate.instant('subscriptions.details.credit.errorTitle'),
        this.translate.instant('subscriptions.details.credit.noCurrenciesAvailable')
      );
      return;
    }
    const result = await this.creditDepositService.show({
      subscriptionAddress: this.subscriptionAddress,
      service: sub.service,
      paymentProcessor,
      currencies,
      // Straight-through (Phase 21): drives the optional "Buy with deposit" section. Read the
      // projected boolean, never metadata JSON — the API parses it once and a stale/unparseable
      // blob would otherwise silently hide the section.
      straightThrough: this.straightThrough(),
    });
    if (result) {
      // A combined deposit+buy can succeed on leg 1 and fail on leg 2. Report that as its own
      // outcome: the cash IS on the claim, so this is neither a failure nor a plain success, and
      // saying "deposited" alone would leave the operator believing units were bought.
      if (result.buyError) {
        await this.alertService.info(
          this.translate.instant('subscriptions.details.credit.depositedBuyFailedTitle'),
          this.translate.instant('subscriptions.details.credit.depositedBuyFailedMessage', { error: result.buyError })
        );
      } else if (result.bought) {
        await this.alertService.info(
          this.translate.instant('subscriptions.details.credit.depositedAndBoughtTitle'),
          this.translate.instant('subscriptions.details.credit.depositedAndBoughtMessage', { tokens: result.bought.tokens })
        );
      } else {
        await this.alertService.info(
          this.translate.instant('subscriptions.details.credit.depositedTitle'),
          result.txHash
            ? (this.translate.instant('subscriptions.details.credit.txPrefix') + result.txHash)
            : this.translate.instant('subscriptions.details.credit.depositSuccessful')
        );
      }
      await this.getCreditData();
    }
  }

  /*
      Straight-through cash-out (Phase 21): redeem units, then OPEN a withdrawal request.

      ⚠️ Nothing here pays anyone. The money moves on the separate fulfil leg, so the success
      copy says "requested" and reports the requestId — never "withdrawn". Reporting a payout at
      the moment a claim was held is precisely what the request/fulfil split exists to prevent.
  */
  async openSellWithdraw() {
    const sub = this.subscription();
    if (!sub) return;
    if (!sub.service) {
      await this.alertService.info(
        this.translate.instant('subscriptions.details.credit.errorTitle'),
        this.translate.instant('subscriptions.details.credit.noTokenIssuerService')
      );
      return;
    }

    const result = await this.sellWithdrawService.show({
      subscriptionAddress: this.subscriptionAddress,
      service: sub.service,
      currencies: this.creditBalances(),
    });
    if (!result) return;

    if (result.withdrawError) {
      // The redeem landed and the request did not open — the proceeds are on the claim. This is
      // its own outcome, not a failure and not a success.
      await this.alertService.info(
        this.translate.instant('subscriptions.details.credit.soldWithdrawFailedTitle'),
        this.translate.instant('subscriptions.details.credit.soldWithdrawFailedMessage', { error: result.withdrawError })
      );
    } else {
      await this.alertService.info(
        this.translate.instant('subscriptions.details.credit.sellWithdrawRequestedTitle'),
        this.translate.instant('subscriptions.details.credit.sellWithdrawRequestedMessage', {
          tokens: result.tokens,
          requestId: result.requestId ?? '—',
        })
      );
    }
    await this.getCreditData();
    // Holdings too — a redeem changes the token balance, not just the claim.
    await this.getHoldings(1, 500);
  }

  async getCreditData() {
    this.loadingService.show(this.translate.instant('subscriptions.details.credit.loadingCreditData'));
    const [, trxData, originVars] = await Promise.all([
      this.getCreditBalances(),
      this.apiService.vaultGetSubscriptionCreditTransactions(this.subscriptionAddress, 1, 50),
      this.apiService.vaultGetGlobalVariablesByCategory('Credit Transaction Origin').catch(() => null),
    ]);

    if (Array.isArray(originVars)) {
      this.originMap = {};
      for (const v of originVars) {
        // The API serves `variable_id`; reading only `variableId` left this map permanently
        // EMPTY, so every row silently fell through to the hardcoded `creditOriginNames`
        // fallback — which looks correct for the seeded origins and renders `Origin #N` for
        // anything a chain adds later, defeating the point of reading the vocabulary at all.
        const id = Number(v?.variableId ?? v?.variable_id);
        if (Number.isFinite(id) && v?.name) this.originMap[id] = v.name;
      }
    }

    if (trxData?.transactions) {
      const mapped = trxData.transactions.map((t: any) => this.mapCreditTransaction(t));
      // Same tie-break as refreshCreditTransactions — see the note there. This is the INITIAL
      // load, so omitting it here means the tab renders the withhold/transfer/fee triplet
      // backwards until the first silent refresh happens to reorder it.
      mapped.sort((a: CreditTransaction, b: CreditTransaction) =>
        (b.startTime - a.startTime) || (Number(b.trxId) - Number(a.trxId)));
      this.creditTransactions.set(mapped);
    }
    this.creditTrxPage.set(1);
    this.loadingService.hide();
  }

  clearCreditFilters() {
    this.filterCreditType.set('');
    this.filterCreditCurrency.set('');
    this.filterCreditAmountOp.set('');
    this.filterCreditAmountVal.set(null);
    this.filterCreditStartDate.set('');
    this.filterCreditEndDate.set('');
    this.creditTrxPage.set(1);
  }

  getCreditTrxTypeClass(trxType: number): string {
    switch (trxType) {
      case 1: return 'bg-green-100 text-green-800';
      case 2: return 'bg-orange-100 text-orange-800';
      case 3: return 'bg-blue-100 text-blue-800';
      case 4: return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  // Direction of a credit row relative to THIS subscription. Deposits are always In,
  // withdrawals Out; transfers compare from/to against the subscription address
  // (covers route-transfer legs where the counterparty is the Credit Switch).
  // Withholds lock funds in place — no direction.
  getCreditTrxDirection(trx: { trxType: number; from?: string; to?: string }): 'In' | 'Out' | '' {
    if (trx.trxType === 1) return 'In';
    if (trx.trxType === 2) return 'Out';
    if (trx.trxType === 3) {
      const sub = this.subscriptionAddress.toLowerCase();
      if ((trx.from || '').toLowerCase() === sub) return 'Out';
      if ((trx.to || '').toLowerCase() === sub) return 'In';
    }
    return '';
  }

  getCreditTrxStateClass(state: number): string {
    switch (state) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-red-100 text-red-800';
      case 4: return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  exportCreditPdf() {
    const txs = this.filteredCreditTransactions();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    const sub = this.subscription();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Credit Transactions - ${sub?.subscription ?? ''}`, pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    // Balances summary table
    const balances = this.creditBalances();
    if (balances.length > 0) {
      autoTable(doc, {
        startY: 28,
        margin: { left: pad, right: pad },
        styles: { fontSize: 8 },
        headStyles: { fillColor: [74, 85, 104] },
        columnStyles: { 1: { halign: 'right' } },
        head: [[
          { content: 'Currency' },
          { content: 'Balance', styles: { halign: 'right' } },
        ]],
        body: balances.map(b => [
          `${b.currencyName} (${b.currencySymbol})`,
          this.utils.formatPrice(b.balance),
        ]),
      });
    }

    autoTable(doc, {
      startY: (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 6 : 28,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: {
        0: { cellWidth: 10 },
        4: { halign: 'right' },
      },
      head: [[
        { content: '#' },
        { content: 'Date' },
        // ⚠️ A PDF has no tooltip either, and it is the artefact most likely to be filed or sent
        // on. The column is narrow, so the meaning goes in a LEGEND beneath the table rather than
        // a header that would wrap unreadably — see the note after autoTable.
        { content: 'Backdated' },
        { content: 'Type' },
        { content: 'Currency' },
        { content: 'Amount', styles: { halign: 'right' } },
        { content: 'State' },
      ]],
      body: txs.map((t, i) => [
        i + 1,
        this.utils.formatDate(t.startTime),
        t.backdated ? 'Yes' : 'No',
        t.trxTypeName,
        t.currencySymbol,
        this.utils.formatPrice(t.amount),
        t.trxStateName,
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    // The legend the narrow column cannot carry. Without it an exported "Backdated: Yes" reads as
    // "approved backdating" — the exact misreading the schema comment guards against, in the one
    // artefact that travels furthest from its context.
    const afterY = (doc as any).lastAutoTable?.finalY ?? 0;
    if (afterY) {
      doc.setFontSize(7);
      doc.text(
        'Backdated = the timestamp was supplied by the caller, not taken from block time. It does '
        + 'NOT indicate the backdating was authorised; authorisation is recorded in the audit trail.',
        14, afterY + 6, { maxWidth: 180 });
    }
    doc.save(`subscription_credit_transactions_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'subscription_credit');
  }

  exportCreditExcel() {
    // ⚠️ THE COLUMN HEADER CARRIES THE MEANING, because an export has no tooltip and no help text.
    // "Backdated" alone in a spreadsheet is exactly the context-free artefact the schema's note
    // warns about — a reader takes it as "approved backdating". The header states what the flag is
    // (a caller-supplied timestamp) and what it is not (an authorisation).
    const rows = this.filteredCreditTransactions().map(t => ({
      'Date': this.utils.formatDate(t.startTime),
      'Backdated (caller-supplied timestamp; not an authorisation)': t.backdated ? 'Yes' : 'No',
      'Type': t.trxTypeName,
      'Currency': t.currencySymbol,
      'Amount': this.utils.roundMoney(t.amount),
      'State': t.trxStateName,
      'From': t.from,
      'To': t.to,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Credit Transactions');

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `subscription_credit_transactions_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'subscription_credit');
  }

  viewTransactionDetails(trx: AssetTransaction): void {
    this.trxInfoService.show(trx);
    this.auditService.logView('transaction', { trxId: trx.trxId, trxType: trx.trxType });
  }

}
