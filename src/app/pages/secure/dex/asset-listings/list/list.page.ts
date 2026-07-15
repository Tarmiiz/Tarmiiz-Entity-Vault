import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
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
    this.loadingService.show('Loading listings...');
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
    this.loadingService.show('Submitting listing request...');
    try {
      const r = await this.apiService.vaultDexAssetListingCreate(result.baseAsset, result.venue, result.country, result.global);
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.listListings();
    } finally { this.loadingService.hide(); }
  }

  exportExcel() {
    const rows = this.filteredListings().map(l => ({
      'Asset':  l.assetName + (l.assetSymbol ? ' (' + l.assetSymbol + ')' : ''),
      'Tier 1': l.venueApproved ? 'Approved' : (l.venuePending ? 'Pending' : '—'),
      'Tier 2': l.countryApproved ? 'Approved' : (l.countryPending ? 'Pending' : '—'),
      'Tier 3': l.globalApproved ? 'Approved' : (l.globalPending ? 'Pending' : '—'),
      'Listed': l.listedAt ? this.utils.formatDate(l.listedAt) : '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DEX Listings');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `dex_listings_${stamp}.xlsx`);
  }

  exportPdf() {
    const listings = this.filteredListings();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('DEX Asset Listings', pad, 15);
    autoTable(doc, {
      startY: 28,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [[ '#', 'Asset', 'Tier 1', 'Tier 2', 'Tier 3', 'Listed' ]],
      body: listings.map((l, i) => [
        i + 1,
        l.assetName + (l.assetSymbol ? ' (' + l.assetSymbol + ')' : ''),
        l.venueApproved ? 'Approved' : (l.venuePending ? 'Pending' : '—'),
        l.countryApproved ? 'Approved' : (l.countryPending ? 'Pending' : '—'),
        l.globalApproved ? 'Approved' : (l.globalPending ? 'Pending' : '—'),
        l.listedAt ? this.utils.formatDate(l.listedAt) : '—',
      ]),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`dex_listings_${stamp}.pdf`);
  }
}
