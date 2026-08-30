import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ethers } from 'ethers';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { HeaderComponent } from '../../../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../../../shared/components/live-indicator/live-indicator.component';
import { ApiService } from '../../../../../shared/services/api.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { SocketService } from '../../../../../shared/services/socket.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { DexOrder } from '../../../../../shared/models/data.model';

import { ModalPlaceOrderService } from '../modals/modal-place-order/modal-place-order.service';
import { ModalPlaceOrderComponent } from '../modals/modal-place-order/modal-place-order.component';
import { PaginatorComponent, pageSlice } from '../../../../../shared/components/paginator/paginator.component';

@Component({
  selector: 'app-vault-dex-orders-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, LiveIndicatorComponent, ModalPlaceOrderComponent, TranslatePipe, PaginatorComponent],
})
export class ListPage implements OnInit, OnDestroy {
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private router = inject(Router);
  private socket = inject(SocketService);
  private placeOrderModal = inject(ModalPlaceOrderService);
  utils = inject(UtilsService);
  private authService = inject(AuthService);
  features = inject(FeaturesService);
  private translate = inject(TranslateService);

  get userInfo() { return this.authService.userInfo; }

  orders = signal<DexOrder[]>([]);
  refreshing = signal(false);
  search = signal('');
  filterStatus = signal<string>('');
  filterSide = signal<string>('');
  filterAsset = signal<string>('');
  filterVenue = signal<string>('');

  private sub?: Subscription;

  ngOnInit() {}

  async ionViewDidEnter() {
    await this.refresh();
    this.sub = this.socket.vaultUpdated$.subscribe(p => {
      if (p.type === 'dex-order') this.refresh(true);
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async refresh(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show(this.translate.instant('dex.orders.list.loadingOrders'));
    try {
      const r = await this.apiService.vaultDexOrdersList({ start: 1, offset: 200 });
      if (r?.orders) this.orders.set(r.orders);
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  /** 1-based, per frontend Standard 1.5. */
  ordersPage = signal(1);
  ordersPageSize = signal(25);
  pagedOrders = computed(() => pageSlice(this.filtered(), this.ordersPage(), this.ordersPageSize()));
  filtered = computed(() => {
    const term = this.search().toLowerCase();
    const status = this.filterStatus();
    const side = this.filterSide();
    const asset = this.filterAsset().toLowerCase();
    const venue = this.filterVenue().toLowerCase();
    return this.orders().filter(o =>
      (!status || String(o.status) === status) &&
      (!side || String(o.side) === side) &&
      (!asset || (o.assetSymbol || '').toLowerCase().includes(asset) || (o.assetName || '').toLowerCase().includes(asset) || o.baseAsset.toLowerCase().includes(asset)) &&
      (!venue || (o.dexServiceName || '').toLowerCase().includes(venue) || o.dexService.toLowerCase().includes(venue)) &&
      (!term ||
        String(o.orderId).includes(term) ||
        (o.assetName || '').toLowerCase().includes(term) ||
        (o.assetSymbol || '').toLowerCase().includes(term) ||
        (o.dexServiceName || '').toLowerCase().includes(term) ||
        o.subscription.toLowerCase().includes(term))
    );
  });

  clearFilters() {
    this.search.set('');
    this.filterStatus.set('');
    this.filterSide.set('');
    this.filterAsset.set('');
    this.filterVenue.set('');
    this.ordersPage.set(1);
  }

  isOpen(o: DexOrder): boolean { return Number(o.status) === 1 || Number(o.status) === 2; }

  getStatusClass(s: number): string {
    switch (Number(s)) {
      case 1: return 'bg-blue-100 text-blue-800';
      case 2: return 'bg-yellow-100 text-yellow-800';
      case 3: return 'bg-green-100 text-green-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  getSideClass(s: number): string {
    return Number(s) === 1 ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800';
  }

  fmtPrice(v: string | number) { const n = Number(v ?? 0); return this.utils.formatPrice(Number.isFinite(n) ? n : 0); }
  fmtAmount(n: string) { return Number(n || '0').toLocaleString(undefined, { maximumFractionDigits: 0 }); }
  fillPct(o: DexOrder): number {
    const a = Number(o.amount || '0');
    const f = Number(o.filled || '0');
    return a > 0 ? Math.min(100, Math.round((f / a) * 100)) : 0;
  }

  view(o: DexOrder) { this.router.navigate(['/authorized/dex/orders/details/' + o.orderId]); }

  async cancel(o: DexOrder, ev: Event) {
    ev.stopPropagation();
    const ok = await this.alertService.show(
      this.translate.instant('dex.orders.cancelConfirm.title'),
      this.translate.instant('dex.orders.cancelConfirm.message', { id: o.orderId }),
      this.translate.instant('dex.orders.cancelConfirm.confirm')
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('dex.orders.cancelConfirm.loading'));
    try {
      const r = await this.apiService.vaultDexCancelOrder(o.orderId);
      if (r?.error) this.alertService.show(this.translate.instant('alerts.error'), r.error);
      await this.refresh();
    } finally { this.loadingService.hide(); }
  }

  /**
   * Time in force (2026-08-11). `expiresAt` is MILLISECONDS on the mirror row, and **0 means
   * good-till-cancelled, not epoch 0** — so every read branches on 0 first.
   */
  isLapsed(o: DexOrder): boolean {
    const exp = Number(o.expiresAt || 0);
    return exp > 0 && Date.now() >= exp;
  }

  expiryLabel(o: DexOrder): string {
    const exp = Number(o.expiresAt || 0);
    return exp > 0 ? this.utils.formatTime(exp) : this.translate.instant('dex.orders.place.tifGtc');
  }

  /**
   * Close a lapsed order and return its escrow. Offered whenever the order is still live and
   * its clock has run out — deliberately NOT gated on ownership or a System Function, because
   * the chain entrypoint is permissionless and the funds go back to the order's own
   * subscription whoever calls. Gating it would only strand capital when the owner is away.
   */
  async expire(o: DexOrder, ev: Event) {
    ev.stopPropagation();
    const ok = await this.alertService.show(
      this.translate.instant('dex.orders.expireConfirm.title'),
      this.translate.instant('dex.orders.expireConfirm.message', { id: o.orderId }),
      this.translate.instant('dex.orders.expireConfirm.confirm')
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('dex.orders.expireConfirm.loading'));
    try {
      const r = await this.apiService.vaultDexExpireOrder(o.orderId);
      if (r?.error) this.alertService.show(this.translate.instant('alerts.error'), r.error);
      await this.refresh();
    } finally { this.loadingService.hide(); }
  }

  async openPlaceOrder() {
    const result = await this.placeOrderModal.show();
    if (!result) return;
    this.loadingService.show(this.translate.instant('dex.orders.list.placingOrder'));
    try {
      const r = await this.apiService.vaultDexPlaceOrder(result);
      if (r?.error) this.alertService.show(this.translate.instant('alerts.error'), r.error);
      await this.refresh();
    } finally { this.loadingService.hide(); }
  }

  exportExcel() {
    const rows = this.filtered().map(o => ({
      'ID': o.orderId,
      'Asset': o.assetSymbol || o.baseAsset,
      'Side': o.sideName,
      'Price': this.fmtPrice(o.price),
      'Currency': o.currencyName || o.currencyCode,
      'Amount': this.fmtAmount(o.amount),
      'Filled': this.fmtAmount(o.filled),
      'Status': o.statusName,
      'Venue': o.dexServiceName || o.dexService,
      'Subscription': o.subscription,
      'Created': o.createdAt ? this.utils.formatDate(o.createdAt) : '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DEX Orders');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `dex_orders_${stamp}.xlsx`);
  }

  exportPdf() {
    const orders = this.filtered();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('DEX Orders', pad, 15);
    autoTable(doc, {
      startY: 28,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [['#', 'ID', 'Asset', 'Side', 'Scope', 'Price', 'Amount', 'Filled', 'Status', 'Venue', 'Created']],
      body: orders.map((o, i) => [
        String(i + 1),
        String(o.orderId),
        o.assetSymbol || o.baseAsset.slice(0, 10),
        o.sideName ?? '',
        this.fmtPrice(o.price),
        this.fmtAmount(o.amount),
        this.fmtAmount(o.filled),
        o.statusName ?? '',
        o.dexServiceName || o.dexService.slice(0, 10),
        o.createdAt ? this.utils.formatDate(o.createdAt) : '—',
      ]),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`dex_orders_${stamp}.pdf`);
  }
}
