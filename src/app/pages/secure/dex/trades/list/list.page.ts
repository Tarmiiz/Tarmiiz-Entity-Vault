import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ethers } from 'ethers';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { HeaderComponent } from '../../../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../../../shared/components/live-indicator/live-indicator.component';
import { ApiService } from '../../../../../shared/services/api.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { SocketService } from '../../../../../shared/services/socket.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { DexTrade } from '../../../../../shared/models/data.model';

@Component({
  selector: 'app-vault-dex-trades-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, LiveIndicatorComponent, TranslatePipe],
})
export class ListPage implements OnInit, OnDestroy {
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private router = inject(Router);
  private socket = inject(SocketService);
  utils = inject(UtilsService);
  features = inject(FeaturesService);

  trades = signal<DexTrade[]>([]);
  refreshing = signal(false);
  search = signal('');
  filterScope = signal<string>('');
  filterAsset = signal<string>('');
  filterVenue = signal<string>('');

  private sub?: Subscription;

  ngOnInit() {}

  async ionViewDidEnter() {
    await this.refresh();
    this.sub = this.socket.vaultUpdated$.subscribe(p => {
      if (p.type === 'dex-trade') this.refresh(true);
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async refresh(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show('Loading trades...');
    try {
      const r = await this.apiService.vaultDexTradesList({ start: 1, offset: 200 });
      if (r?.trades) this.trades.set(r.trades);
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  filtered = computed(() => {
    const term = this.search().toLowerCase();
    const scope = this.filterScope();
    const asset = this.filterAsset().toLowerCase();
    const venue = this.filterVenue().toLowerCase();
    return this.trades().filter(t =>
      (!scope || String(t.marketScope) === scope) &&
      (!asset || (t.assetSymbol || '').toLowerCase().includes(asset) || (t.assetName || '').toLowerCase().includes(asset) || t.baseAsset.toLowerCase().includes(asset)) &&
      (!venue || (t.buyDexServiceName || '').toLowerCase().includes(venue) || (t.sellDexServiceName || '').toLowerCase().includes(venue) || t.buyDexService.toLowerCase().includes(venue) || t.sellDexService.toLowerCase().includes(venue)) &&
      (!term ||
        String(t.tradeId).includes(term) ||
        (t.assetName || '').toLowerCase().includes(term) ||
        (t.assetSymbol || '').toLowerCase().includes(term) ||
        t.buyer.toLowerCase().includes(term) ||
        t.seller.toLowerCase().includes(term))
    );
  });

  clearFilters() {
    this.search.set('');
    this.filterScope.set('');
    this.filterAsset.set('');
    this.filterVenue.set('');
  }

  fmtPrice(wei: string) { try { return Number(ethers.formatEther(wei || '0')).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }); } catch { return '0.00'; } }
  fmtAmount(n: string) { return Number(n || '0').toLocaleString(undefined, { maximumFractionDigits: 0 }); }
  fmtTotal(amount: string, priceWei: string) {
    try {
      const p = Number(ethers.formatEther(priceWei || '0'));
      const a = Number(amount || '0');
      return (a * p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    } catch { return '0.00'; }
  }

  view(t: DexTrade) { this.router.navigate(['/authorized/dex/trades/details/' + t.tradeId]); }

  exportExcel() {
    const rows = this.filtered().map(t => ({
      'ID': t.tradeId,
      'Asset': t.assetSymbol || t.baseAsset,
      'Amount': this.fmtAmount(t.amount),
      'Price': this.fmtPrice(t.price),
      'Credit': this.fmtPrice(t.creditAmount),
      'Currency': t.currencyName || t.currencyCode,
      'Buy Venue': t.buyDexServiceName || t.buyDexService,
      'Sell Venue': t.sellDexServiceName || t.sellDexService,
      'Buyer': t.buyer,
      'Seller': t.seller,
      'Scope': t.marketScopeName,
      'Executed': t.executedAt ? this.utils.formatDate(t.executedAt) : '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DEX Trades');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `dex_trades_${stamp}.xlsx`);
  }

  exportPdf() {
    const trades = this.filtered();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('DEX Trades', pad, 15);
    autoTable(doc, {
      startY: 28,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [['#', 'ID', 'Asset', 'Amount', 'Price', 'Credit', 'Buy Venue', 'Sell Venue', 'Scope', 'Executed']],
      body: trades.map((t, i) => [
        String(i + 1),
        String(t.tradeId),
        t.assetSymbol || t.baseAsset.slice(0, 10),
        this.fmtAmount(t.amount),
        this.fmtPrice(t.price),
        this.fmtPrice(t.creditAmount),
        t.buyDexServiceName || t.buyDexService.slice(0, 10),
        t.sellDexServiceName || t.sellDexService.slice(0, 10),
        t.marketScopeName ?? '',
        t.executedAt ? this.utils.formatDate(t.executedAt) : '—',
      ]),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`dex_trades_${stamp}.pdf`);
  }
}
