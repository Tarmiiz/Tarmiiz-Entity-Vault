import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { HeaderComponent } from "../../../../../shared/components/header/header.component";
import { ApiService } from '../../../../../shared/services/api.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../../shared/services/utils.service';
import { DexAssetListing } from '../../../../../shared/models/data.model';

import { ModalListingCreateService } from '../modals/modal-listing-create/modal-listing-create.service';
import { ModalListingCreateComponent } from '../modals/modal-listing-create/modal-listing-create.component';

@Component({
  selector: 'app-dex-asset-listings-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, ModalListingCreateComponent, TranslatePipe],
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  utils = inject(UtilsService);
  private listingCreateService = inject(ModalListingCreateService);
  private authService = inject(AuthService);
  features = inject(FeaturesService);
  private translate = inject(TranslateService);

  get userInfo() { return this.authService.userInfo; }

  loadingListings = false;
  listings = signal<DexAssetListing[]>([]);
  searchTerm = signal('');

  ngOnInit() {}

  async ionViewDidEnter() {
    this.loadingListings = true;
    await this.listListings();
    this.loadingListings = false;
  }

  async listListings() {
    this.loadingService.show(this.translate.instant('dex.listings.list.loading'));
    const result = await this.apiService.vaultDexAssetListingsList(1, 50);
    if (result?.listings) this.listings.set(result.listings);
    this.loadingService.hide();
  }

  viewDetails(l: DexAssetListing) {
    this.router.navigate(['/authorized/dex/asset-listings/details/' + l.baseAsset]);
  }

  filteredListings = computed(() => {
    const term = this.searchTerm().toLowerCase();
    return this.listings().filter(l =>
      !term ||
      l.assetName?.toLowerCase().includes(term) ||
      l.assetSymbol?.toLowerCase().includes(term) ||
      l.baseAsset.toLowerCase().includes(term)
    );
  });

  clearFilters() { this.searchTerm.set(''); }

  async createListing() {
    const result = await this.listingCreateService.show();
    if (!result) return;
    this.loadingService.show(this.translate.instant('dex.listings.list.submitting'));
    try {
      const r = await this.apiService.vaultDexAssetListingCreate(result.baseAsset, result.venue, result.country, result.global);
      if (r?.error) this.alertService.show(this.translate.instant('dex.listings.error'), r.error);
      else await this.listListings();
    } finally { this.loadingService.hide(); }
  }

  exportExcel() {
    const assetLabel = this.translate.instant('dex.listings.table.asset');
    const tier1Label = this.translate.instant('dex.listings.list.export.tier1');
    const tier2Label = this.translate.instant('dex.listings.list.export.tier2');
    const tier3Label = this.translate.instant('dex.listings.list.export.tier3');
    const listedLabel = this.translate.instant('dex.listings.table.listed');
    const approvedLabel = this.translate.instant('state.approved');
    const pendingLabel = this.translate.instant('state.pending');

    const rows = this.filteredListings().map(l => ({
      [assetLabel]:  l.assetName + (l.assetSymbol ? ' (' + l.assetSymbol + ')' : ''),
      [tier1Label]: l.venueApproved ? approvedLabel : (l.venuePending ? pendingLabel : '—'),
      [tier2Label]: l.countryApproved ? approvedLabel : (l.countryPending ? pendingLabel : '—'),
      [tier3Label]: l.globalApproved ? approvedLabel : (l.globalPending ? pendingLabel : '—'),
      [listedLabel]: l.listedAt ? this.utils.formatDate(l.listedAt) : '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, this.translate.instant('dex.listings.list.export.sheetName'));
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `dex_listings_${stamp}.xlsx`);
  }

  exportPdf() {
    const listings = this.filteredListings();
    const idLabel = this.translate.instant('dex.listings.table.id');
    const assetLabel = this.translate.instant('dex.listings.table.asset');
    const tier1Label = this.translate.instant('dex.listings.list.export.tier1');
    const tier2Label = this.translate.instant('dex.listings.list.export.tier2');
    const tier3Label = this.translate.instant('dex.listings.list.export.tier3');
    const listedLabel = this.translate.instant('dex.listings.table.listed');
    const approvedLabel = this.translate.instant('state.approved');
    const pendingLabel = this.translate.instant('state.pending');
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(this.translate.instant('dex.listings.list.export.pdfTitle'), pad, 15);
    autoTable(doc, {
      startY: 28,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [[ idLabel, assetLabel, tier1Label, tier2Label, tier3Label, listedLabel ]],
      body: listings.map((l, i) => [
        i + 1,
        l.assetName + (l.assetSymbol ? ' (' + l.assetSymbol + ')' : ''),
        l.venueApproved ? approvedLabel : (l.venuePending ? pendingLabel : '—'),
        l.countryApproved ? approvedLabel : (l.countryPending ? pendingLabel : '—'),
        l.globalApproved ? approvedLabel : (l.globalPending ? pendingLabel : '—'),
        l.listedAt ? this.utils.formatDate(l.listedAt) : '—',
      ]),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`dex_listings_${stamp}.pdf`);
  }
}
