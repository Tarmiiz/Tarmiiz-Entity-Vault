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
import { DexVenue } from '../../../../../shared/models/data.model';

import { ModalVenueCreateService } from '../modals/modal-venue-create/modal-venue-create.service';
import { ModalVenueCreateComponent } from '../modals/modal-venue-create/modal-venue-create.component';
import { PaginatorComponent, pageSlice } from '../../../../../shared/components/paginator/paginator.component';

@Component({
  selector: 'app-dex-venues-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, ModalVenueCreateComponent, TranslatePipe, PaginatorComponent],
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  utils = inject(UtilsService);
  private venueCreateService = inject(ModalVenueCreateService);
  private authService = inject(AuthService);
  features = inject(FeaturesService);
  private translate = inject(TranslateService);

  get userInfo() { return this.authService.userInfo; }

  loadingVenues = false;
  venues = signal<DexVenue[]>([]);
  searchTerm = signal('');
  filterState = signal<string>('');

  ngOnInit() {}

  async ionViewDidEnter() {
    this.loadingVenues = true;
    await this.listVenues();
    this.loadingVenues = false;
  }

  async listVenues() {
    this.loadingService.show(this.translate.instant('dex.venues.list.loadingVenues'));
    const result = await this.apiService.vaultDexVenuesList(1, 50);
    if (result?.venues) this.venues.set(result.venues);
    this.loadingService.hide();
  }

  getStateClass(stateId: number | undefined): string {
    if (stateId === undefined) return 'bg-gray-100 text-gray-800';
    switch (stateId) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  stateName(s: number): string {
    switch (s) {
      case 1: return this.translate.instant('state.registered');
      case 2: return this.translate.instant('state.active');
      case 3: return this.translate.instant('state.paused');
      case 4: return this.translate.instant('state.deregistered');
      default: return String(s);
    }
  }

  viewDetails(v: DexVenue) {
    this.router.navigate(['/authorized/dex/venues/details/' + v.serviceAddress]);
  }

  /** 1-based, per frontend Standard 1.5. */
  venuesPage = signal(1);
  venuesPageSize = signal(25);
  pagedVenues = computed(() => pageSlice(this.filteredVenues(), this.venuesPage(), this.venuesPageSize()));
  filteredVenues = computed(() => {
    const term  = this.searchTerm().toLowerCase();
    const state = this.filterState();
    return this.venues().filter(v =>
      (!state || String(v.state) === state) &&
      (!term  ||
        v.serviceName?.toLowerCase().includes(term) ||
        v.serviceAddress.toLowerCase().includes(term))
    );
  });

  clearFilters() {
    this.searchTerm.set('');
    this.filterState.set('');
    this.venuesPage.set(1);
  }

  async createVenue() {
    const result = await this.venueCreateService.show();
    if (!result) return;
    this.loadingService.show(this.translate.instant('dex.venues.list.creatingVenue'));
    try {
      const r = await this.apiService.vaultDexVenueCreate(result.serviceAddress, result.settlementMode);
      if (r?.error) this.alertService.info(this.translate.instant('alerts.error'), r.error);
      else await this.listVenues();
    } finally { this.loadingService.hide(); }
  }

  exportExcel() {
    const serviceLabel = this.translate.instant('dex.venues.table.service');
    const stateLabel = this.translate.instant('common.state');
    const suspendedLabel = this.translate.instant('state.suspended');
    const registeredLabel = this.translate.instant('dex.venues.table.registered');
    const yesLabel = this.translate.instant('common.yes');
    const noLabel = this.translate.instant('common.no');
    const rows = this.filteredVenues().map(v => ({
      [serviceLabel]:    v.serviceName || v.serviceAddress,
      [stateLabel]:      this.stateName(v.state),
      [suspendedLabel]:  v.suspended ? yesLabel : noLabel,
      [registeredLabel]: v.registeredAt ? this.utils.formatDate(v.registeredAt) : '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, this.translate.instant('dex.venues.fullTitle'));
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `dex_venues_${stamp}.xlsx`);
  }

  exportPdf() {
    const venues = this.filteredVenues();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(this.translate.instant('dex.venues.fullTitle'), pad, 15);
    autoTable(doc, {
      startY: 28,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [[
        this.translate.instant('common.id'),
        this.translate.instant('dex.venues.table.service'),
        this.translate.instant('common.state'),
        this.translate.instant('state.suspended'),
        this.translate.instant('dex.venues.table.registered'),
      ]],
      body: venues.map((v, i) => [
        i + 1,
        v.serviceName || v.serviceAddress,
        this.stateName(v.state),
        v.suspended ? this.translate.instant('common.yes') : this.translate.instant('common.no'),
        v.registeredAt ? this.utils.formatDate(v.registeredAt) : '—',
      ]),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`dex_venues_${stamp}.pdf`);
  }
}
