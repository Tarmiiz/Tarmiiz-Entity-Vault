import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ethers } from 'ethers';

import { HeaderComponent } from '../../../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../../../shared/components/live-indicator/live-indicator.component';
import { ApiService } from '../../../../../shared/services/api.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { SocketService } from '../../../../../shared/services/socket.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { DexTrade } from '../../../../../shared/models/data.model';

@Component({
  selector: 'app-vault-dex-trade-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [HeaderComponent, LiveIndicatorComponent, RouterLink, TranslatePipe],
})
export class DetailsPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private translate = inject(TranslateService);
  private socket = inject(SocketService);
  utils = inject(UtilsService);

  tradeId = signal<number>(0);
  trade = signal<DexTrade | undefined>(undefined);
  refreshing = signal(false);

  private sub?: Subscription;

  constructor() {
    const id = this.route.snapshot.paramMap.get('tradeId');
    if (id) this.tradeId.set(Number(id));
  }

  ngOnInit() {}

  async ionViewWillEnter() {
    await this.load();
    this.sub = this.socket.vaultUpdated$.subscribe(p => {
      if (p.type === 'dex-trade') this.load(true);
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async load(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show(this.translate.instant('dex.trades.loadingOne'));
    try {
      const t = await this.apiService.vaultDexTradeInfo(this.tradeId());
      if (t) this.trade.set(t);
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  fmtPrice(v: string | number) { const n = Number(v ?? 0); return this.utils.formatPrice(Number.isFinite(n) ? n : 0); }
  fmtAmount(n: string) { return Number(n || '0').toLocaleString(undefined, { maximumFractionDigits: 0 }); }

  goOrder(id: number) { this.router.navigate(['/authorized/dex/orders/details/' + id]); }
}
