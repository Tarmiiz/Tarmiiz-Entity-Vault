import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../shared/components/header/header.component';
import { ApiService } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { FeaturesService } from '../../../shared/services/features.service';
import { UtilsService } from '../../../shared/services/utils.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { ModalServiceFeeConfigService } from '../services/modals/modal-service-fee-config/modal-service-fee-config.service';
import { ModalServiceFeeConfigComponent } from '../services/modals/modal-service-fee-config/modal-service-fee-config.component';
import { DistributionAgreement, PrimaryTrade, User } from '../../../shared/models/data.model';

/**
 * Distribution — the distributor side of the issuer/distributor model (D1/D4).
 * Inbound tab: every (asset, my service) registration — pending invitations the
 * distributor must ACCEPT (it fronts redemptions from its own liquidity, becoming
 * an unsecured creditor of the issuer) and live agreements, each with this
 * service's OWN per-asset fee config (the uniform D7b engine).
 * Trades tab: the tenant's primary-market feed (announced mesh rows — trades
 * where this tenant is the distributor OR the issuer).
 */
@Component({
  selector: 'app-distribution',
  templateUrl: './distribution.page.html',
  styleUrls: ['./distribution.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, ModalServiceFeeConfigComponent, TranslatePipe],
})
export class DistributionPage implements OnInit {
  private apiService     = inject(ApiService);
  private authService    = inject(AuthService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);
  private router         = inject(Router);
  private feeConfigModal = inject(ModalServiceFeeConfigService);
  utils = inject(UtilsService);
  features = inject(FeaturesService);

  userInfo!: User;

  activeTab = signal<'agreements' | 'trades'>('agreements');
  loaded = signal(false);

  agreements = signal<DistributionAgreement[]>([]);
  trades = signal<PrimaryTrade[]>([]);
  tradesTotal = signal(0);

  ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      await Promise.all([this.loadAgreements(), this.loadTrades()]);
    } finally {
      this.loadingService.hide();
      this.loaded.set(true);
    }
  }

  private async loadAgreements() {
    this.agreements.set(await this.apiService.vaultDistributionInbound());
  }

  private async loadTrades() {
    const data = await this.apiService.vaultPrimaryTrades({ start: 0, offset: 200 });
    this.trades.set(data?.trades ?? []);
    this.tradesTotal.set(data?.totalCount ?? 0);
  }

  canAct(): boolean {
    return !!this.userInfo && this.userInfo.role !== 3;
  }

  agreementStateClass(state: number): string {
    switch (Number(state)) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  agreementStateName(state: number): string {
    switch (Number(state)) {
      case 1: return this.translate.instant('distribution.states.pending');
      case 2: return this.translate.instant('distribution.states.active');
      case 3: return this.translate.instant('distribution.states.suspended');
      case 4: return this.translate.instant('distribution.states.deactivated');
      default: return String(state);
    }
  }

  gotoAsset(addr: string) {
    this.router.navigate(['/authorized/assets/details/' + addr]);
  }

  async acceptAgreement(a: DistributionAgreement) {
    const confirmed = await this.alertService.show(
      this.translate.instant('distribution.acceptTitle'),
      this.translate.instant('distribution.acceptMessage', { asset: a.assetName || a.asset, service: a.serviceName || a.service }),
      this.translate.instant('distribution.acceptBtn'),
    );
    if (!confirmed) return;
    this.loadingService.show(this.translate.instant('distribution.accepting'));
    try {
      const res = await this.apiService.vaultDistributionAccept(a.asset, a.service);
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.loadAgreements();
      }
    } finally {
      this.loadingService.hide();
    }
  }

  // The distributor's OWN per-asset fee config (D7b), on its own ServiceTemplate.
  async openFeeConfig(a: DistributionAgreement) {
    const res = await this.apiService.vaultGetServiceFeeConfig(a.service, a.asset);
    const result = await this.feeConfigModal.show({
      service: a.service,
      serviceName: a.serviceName || a.service,
      asset: a.asset,
      assetSymbol: a.assetSymbol || a.asset,
      feeConfig: res?.feeConfig ?? null,
    });
    if (!result) return;
    this.loadingService.show(this.translate.instant('distribution.savingFees'));
    try {
      const r = await this.apiService.vaultSetServiceFeeConfig(a.service, a.asset, result.feeConfig);
      if ((r as any)?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), (r as any).error);
      }
    } finally {
      this.loadingService.hide();
    }
  }
}
