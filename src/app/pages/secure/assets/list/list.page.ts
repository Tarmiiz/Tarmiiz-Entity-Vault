import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { RpcService } from '../../../../shared/services/rpc.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { ModalAssetAddService } from '../modals/modal-asset-add/modal-asset-add.service';
import { ModalAssetAddComponent } from '../modals/modal-asset-add/modal-asset-add.component';

import { Asset } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    ModalAssetAddComponent,
  ]
})
export class ListPage implements OnInit {
  private rpcService = inject(RpcService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private assetAddService = inject(ModalAssetAddService);
  private utils = inject(UtilsService);

  loadingData: boolean = false;

  assetsCount = 0;
  assets = signal<Asset[]>([]);

  filterType = signal<string>('');
  filterState = signal<string>('');
  filterService = signal<string>('');
  filterCirculatingOp = signal<'' | 'gt' | 'lt'>('');
  filterCirculatingAmt = signal<number | null>(null);

  uniqueTypes = computed(() =>
    [...new Set(this.assets().map(a => a.assetTypeName).filter(Boolean))].sort()
  );
  uniqueServices = computed(() =>
    [...new Map(
      this.assets().flatMap(a => a.services.map(s => [s.service, s.serviceName] as [string, string]))
    ).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  );

  filteredAssets = computed(() => {
    const type = this.filterType();
    const state = this.filterState();
    const service = this.filterService();
    const op = this.filterCirculatingOp();
    const amt = this.filterCirculatingAmt();
    return this.assets().filter(a => {
      if (type && a.assetTypeName !== type) return false;
      if (state && String(a.state) !== state) return false;
      if (service && !a.services.some(s => s.service === service)) return false;
      if (op && amt !== null) {
        if (op === 'gt' && a.circulating <= amt) return false;
        if (op === 'lt' && a.circulating >= amt) return false;
      }
      return true;
    });
  });

  clearFilters() {
    this.filterType.set('');
    this.filterState.set('');
    this.filterService.set('');
    this.filterCirculatingOp.set('');
    this.filterCirculatingAmt.set(null);
  }

  constructor() {}

  ngOnInit() {}

  async ionViewWillEnter() {
    this.assets.set([]);
    this.assetsCount = 0;
  }

  async ionViewDidEnter() {
    this.loadingData = true;
    await this.listAssets();
    this.loadingData = false;
  }

  getStateClass(stateId: number | undefined): string {
    if (stateId === undefined) return 'bg-gray-100 text-gray-800';
    switch(stateId) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  async listAssets() {
    this.loadingService.show('Loading data...');
    this.assets.set([]);
    const result = await this.rpcService.assetsListOwn(1, 10);
    if (result.result) {
      this.assetsCount = result.result.count;
      this.assets.set(result.result.assets);
    } else {
      console.log(result.error);
    }
    this.loadingService.hide();
  }

  async openAddModal() {
    const data = await this.assetAddService.show();
    if (!data) return;

    this.loadingService.show('Creating asset...');
    try {
      const metadata = JSON.stringify({ description: data.description });
      const result = await this.rpcService.assetCreate(
        data.owner,
        data.service,
        data.issuer,
        data.manager,
        data.name,
        data.symbol,
        metadata,
        data.currency,
        data.regulator
      );
      if (result.success) {
        await this.listAssets();
      } else {
        this.alertService.show('Error', 'Failed to create asset.');
      }
    } catch (error) {
      this.alertService.show('Error', 'An unexpected error occurred.');
    } finally {
      this.loadingService.hide();
    }
  }

  viewDetails(asset: Asset) {
    this.router.navigate(['/authorized/assets/details/' + asset.address]);
  }

  exportExcel() {
    const rows = this.filteredAssets().map(a => ({
      'Name': a.name,
      'Symbol': a.symbol,
      'Service': a.services.length > 0 ? a.services[0].serviceName : 'None',
      'Type': a.assetTypeName,
      'Circulating': a.circulating,
      'State': a.stateName,
      'Suspended': a.suspended ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assets');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `assets_${stamp}.xlsx`);
  }

  exportPdf() {
    const assets = this.filteredAssets();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Assets', pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${this.utils.formatDate(Math.floor(Date.now() / 1000))}`, pad, 21);

    const svcLabel = this.filterService()
      ? (this.uniqueServices().find(s => s[0] === this.filterService())?.[1] ?? this.filterService())
      : 'None';
    const circOp = this.filterCirculatingOp();
    const circAmt = this.filterCirculatingAmt();
    const circLabel = circOp && circAmt !== null ? `${circOp === 'gt' ? '>' : '<'} ${circAmt}` : 'None';
    const filterParts = [
      `Type: ${this.filterType() || 'None'}`,
      `State: ${this.filterState() || 'None'}`,
      `Service: ${svcLabel}`,
      `Circulating: ${circLabel}`,
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
      columnStyles: { 5: { halign: 'right' } },
      head: [[ '#', 'Name', 'Symbol', 'Service', 'Type', { content: 'Circulating', styles: { halign: 'right' } }, 'State' ]],
      body: assets.map((a, i) => [
        i + 1,
        a.name,
        a.symbol,
        a.services.length > 0 ? a.services[0].serviceName : 'None',
        a.assetTypeName,
        this.utils.formatTokens(a.circulating),
        a.suspended ? `${a.stateName} (Suspended)` : a.stateName,
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`assets_${stamp}.pdf`);
  }
}
