import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../shared/components/header/header.component';
import { ApiService } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { FeaturesService } from '../../../shared/services/features.service';
import { UtilsService } from '../../../shared/services/utils.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { CreditPosition, CreditObligation, CreditSettlement, User } from '../../../shared/models/data.model';

/**
 * Settlements — the fiat leg of the credit ledger (issuer/DEX model D9-D11).
 * Every cross-entity credit move creates an on-chain obligation and updates a
 * running signed net per (entity pair, currency); settlements discharge the NET:
 * the debtor creates + confirms "sent" (wire reference + optional receipt doc),
 * the creditor confirms "received" (the only net-decrement transition, on-chain).
 */
@Component({
  selector: 'app-settlements',
  templateUrl: './settlements.page.html',
  styleUrls: ['./settlements.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, TranslatePipe],
})
export class SettlementsPage implements OnInit {
  private apiService     = inject(ApiService);
  private authService    = inject(AuthService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);
  utils = inject(UtilsService);
  // Public so the template can gate the action buttons.
  features = inject(FeaturesService);

  userInfo!: User;
  selfEntity = '';

  activeTab = signal<'positions' | 'obligations' | 'settlements'>('positions');
  loaded = signal(false);

  positions   = signal<CreditPosition[]>([]);
  obligations = signal<CreditObligation[]>([]);
  obligationsTotal = signal(0);
  settlements = signal<CreditSettlement[]>([]);
  settlementsTotal = signal(0);

  // code → display name from the approved-currencies read (best-effort).
  private currencyNames = signal<Record<number, string>>({});

  // ── Create-settlement modal state ─────────────────────────────────────────
  createModalOpen = signal(false);
  createCounterparty = '';
  createCurrencyCode = 0;
  createAmount = '';
  createMemo = '';
  // Live chain pre-flight of the pair position (net minus in-flight cover).
  createPreflight = signal<{ netOwedByCaller: string; inFlightOwedByCaller: string; inFlightOwedToCaller: string } | null>(null);

  // ── Confirm-sent modal state (debtor side; wire ref + optional receipt) ───
  sentModalOpen = signal(false);
  sentSettlement = signal<CreditSettlement | null>(null);
  sentWireRef = '';
  sentMemo = '';
  sentReceiptFile: File | null = null;

  // ── Confirm-received modal state (creditor side) ──────────────────────────
  receivedModalOpen = signal(false);
  receivedSettlement = signal<CreditSettlement | null>(null);
  receivedNote = '';

  availableToSettle = computed(() => {
    const p = this.createPreflight();
    if (!p) return null;
    const avail = Number(p.netOwedByCaller) - Number(p.inFlightOwedByCaller);
    return Number.isFinite(avail) ? avail : null;
  });

  ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.selfEntity = (this.authService.entityInfo?.address || '').toLowerCase();
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      await Promise.all([
        this.loadPositions(),
        this.loadObligations(),
        this.loadSettlements(),
        this.loadCurrencies(),
      ]);
    } finally {
      this.loadingService.hide();
      this.loaded.set(true);
    }
  }

  private async loadPositions() {
    this.positions.set(await this.apiService.vaultSettlementPositions());
  }

  private async loadObligations() {
    const data = await this.apiService.vaultSettlementObligations({ start: 0, offset: 200 });
    this.obligations.set(data?.obligations ?? []);
    this.obligationsTotal.set(data?.totalCount ?? 0);
  }

  private async loadSettlements() {
    const data = await this.apiService.vaultSettlementsList({ start: 0, offset: 200 });
    this.settlements.set(data?.settlements ?? []);
    this.settlementsTotal.set(data?.totalCount ?? 0);
  }

  private async loadCurrencies() {
    const data = await this.apiService.vaultGetApprovedCurrencies();
    const map: Record<number, string> = {};
    for (const c of (data?.currencies ?? [])) map[Number(c.code)] = c.name || c.symbol || '';
    this.currencyNames.set(map);
  }

  currencyLabel(code: number): string {
    const name = this.currencyNames()[Number(code)];
    return name ? `${name} (${code})` : String(code);
  }

  isSelf(addr: string): boolean {
    return (addr || '').toLowerCase() === this.selfEntity;
  }

  counterpartyOf(row: { debtorEntity: string; creditorEntity: string }): string {
    return this.isSelf(row.debtorEntity) ? row.creditorEntity : row.debtorEntity;
  }

  // True when THIS entity is the debtor on the row (we owe — payable side).
  isDebtor(row: { debtorEntity: string }): boolean {
    return this.isSelf(row.debtorEntity);
  }

  obligationKindName(kind: number): string {
    switch (Number(kind)) {
      case 1: return this.translate.instant('settlements.obligations.kindDerived');
      case 2: return this.translate.instant('settlements.obligations.kindDeclared');
      case 3: return this.translate.instant('settlements.obligations.kindClaimed');
      default: return String(kind);
    }
  }

  settlementStateName(state: number): string {
    switch (Number(state)) {
      case 1: return this.translate.instant('settlements.states.pending');
      case 2: return this.translate.instant('settlements.states.sentConfirmed');
      case 3: return this.translate.instant('settlements.states.settled');
      case 4: return this.translate.instant('settlements.states.cancelled');
      default: return String(state);
    }
  }

  settlementStateClass(state: number): string {
    switch (Number(state)) {
      case 1: return 'bg-amber-100 text-amber-800';
      case 2: return 'bg-blue-100 text-blue-800';
      case 3: return 'bg-green-100 text-green-800';
      case 4: return 'bg-gray-200 text-gray-600';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  canAct(): boolean {
    return !!this.userInfo && this.userInfo.role !== 3;
  }

  // ── Create settlement (debtor side) ───────────────────────────────────────
  async openCreateModal(pos?: CreditPosition) {
    this.createCounterparty = pos?.counterparty || '';
    this.createCurrencyCode = pos?.currencyCode ?? 0;
    this.createAmount = '';
    this.createMemo = '';
    this.createPreflight.set(null);
    this.createModalOpen.set(true);
    if (pos) await this.refreshPreflight();
  }

  async refreshPreflight() {
    this.createPreflight.set(null);
    const cp = this.createCounterparty.trim();
    if (!cp || !this.createCurrencyCode) return;
    const p = await this.apiService.vaultSettlementPositionWith(cp, this.createCurrencyCode);
    if (p) this.createPreflight.set(p);
  }

  async submitCreate() {
    const cp = this.createCounterparty.trim();
    const amount = Number(this.createAmount);
    if (!cp || !this.createCurrencyCode || !(amount > 0)) return;
    this.createModalOpen.set(false);
    this.loadingService.show(this.translate.instant('settlements.creating'));
    try {
      const res = await this.apiService.vaultSettlementCreate({
        counterparty: cp,
        currencyCode: Number(this.createCurrencyCode),
        amount: String(this.createAmount),
        memo: this.createMemo.trim(),
      });
      if (res?.requestId) {
        this.alertService.show(this.translate.instant('approvals.submittedTitle'), this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
      } else if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else {
        await Promise.all([this.loadSettlements(), this.loadPositions()]);
        this.activeTab.set('settlements');
      }
    } finally {
      this.loadingService.hide();
    }
  }

  // ── Confirm sent (debtor side) ────────────────────────────────────────────
  openSentModal(s: CreditSettlement) {
    this.sentSettlement.set(s);
    this.sentWireRef = '';
    this.sentMemo = '';
    this.sentReceiptFile = null;
    this.sentModalOpen.set(true);
  }

  onReceiptFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.sentReceiptFile = input.files?.[0] ?? null;
  }

  async submitConfirmSent() {
    const s = this.sentSettlement();
    if (!s || !this.sentWireRef.trim()) return;
    this.sentModalOpen.set(false);
    this.loadingService.show(this.translate.instant('settlements.confirmingSent'));
    try {
      const res = await this.apiService.vaultSettlementConfirmSent({
        debtorEntity: s.debtorEntity,
        creditorEntity: s.creditorEntity,
        settlementId: s.settlementId,
        wireRef: this.sentWireRef.trim(),
        currencyCode: s.currencyCode,
        amount: String(s.amount),
        memo: this.sentMemo.trim(),
      }, this.sentReceiptFile);
      if (res?.requestId) {
        this.alertService.show(this.translate.instant('approvals.submittedTitle'), this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
      } else if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.loadSettlements();
      }
    } finally {
      this.loadingService.hide();
    }
  }

  // ── Confirm received (creditor side — the net-decrement transition) ───────
  openReceivedModal(s: CreditSettlement) {
    this.receivedSettlement.set(s);
    this.receivedNote = '';
    this.receivedModalOpen.set(true);
  }

  async submitConfirmReceived() {
    const s = this.receivedSettlement();
    if (!s) return;
    this.receivedModalOpen.set(false);
    this.loadingService.show(this.translate.instant('settlements.confirmingReceived'));
    try {
      const res = await this.apiService.vaultSettlementConfirmReceived({
        debtorEntity: s.debtorEntity,
        creditorEntity: s.creditorEntity,
        settlementId: s.settlementId,
        note: this.receivedNote.trim(),
      });
      if (res?.requestId) {
        this.alertService.show(this.translate.instant('approvals.submittedTitle'), this.translate.instant('approvals.submittedMessage'), this.translate.instant('alerts.ok'));
      } else if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else {
        await Promise.all([this.loadSettlements(), this.loadPositions()]);
      }
    } finally {
      this.loadingService.hide();
    }
  }

  // ── Cancel (debtor side, Pending only) ────────────────────────────────────
  async cancelSettlement(s: CreditSettlement) {
    const confirmed = await this.alertService.show(
      this.translate.instant('settlements.cancelTitle'),
      this.translate.instant('settlements.cancelMessage', { id: s.settlementId }),
      this.translate.instant('alerts.ok'),
    );
    if (!confirmed) return;
    this.loadingService.show(this.translate.instant('settlements.cancelling'));
    try {
      const res = await this.apiService.vaultSettlementCancel(s.debtorEntity, s.creditorEntity, s.settlementId);
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else {
        await Promise.all([this.loadSettlements(), this.loadPositions()]);
      }
    } finally {
      this.loadingService.hide();
    }
  }
}
