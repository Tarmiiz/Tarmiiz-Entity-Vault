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
import { DexVenue } from '../../../../../shared/models/data.model';

import { ModalVenueCreateService } from '../modals/modal-venue-create/modal-venue-create.service';
import { ModalVenueCreateComponent } from '../modals/modal-venue-create/modal-venue-create.component';

@Component({
  selector: 'app-dex-venues-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, ModalVenueCreateComponent, TranslatePipe],
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
    this.loadingService.show('Loading venues...');
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
      case 1: return 'Registered';
      case 2: return 'Active';
      case 3: return 'Paused';
      case 4: return 'Deregistered';
      default: return String(s);
    }
  }

  viewDetails(v: DexVenue) {
    this.router.navigate(['/authorized/dex/venues/details/' + v.serviceAddress]);
  }

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
  }

  async createVenue() {
    const result = await this.venueCreateService.show();
    if (!result) return;
    this.loadingService.show('Creating venue...');
    try {
      const r = await this.apiService.vaultDexVenueCreate(result.serviceAddress);
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.listVenues();
    } finally { this.loadingService.hide(); }
  }

  exportExcel() {
    const rows = this.filteredVenues().map(v => ({
      'Service':   v.serviceName || v.serviceAddress,
      'State':     this.stateName(v.state),
      'Suspended': v.suspended ? 'Yes' : 'No',
      'Registered': v.registeredAt ? this.utils.formatDate(v.registeredAt) : '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DEX Venues');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `dex_venues_${stamp}.xlsx`);
  }

  exportPdf() {
    const venues = this.filteredVenues();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('DEX Venues', pad, 15);
    autoTable(doc, {
      startY: 28,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [[ '#', 'Service', 'State', 'Suspended', 'Registered' ]],
      body: venues.map((v, i) => [
        i + 1,
        v.serviceName || v.serviceAddress,
        this.stateName(v.state),
        v.suspended ? 'Yes' : 'No',
        v.registeredAt ? this.utils.formatDate(v.registeredAt) : '—',
      ]),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`dex_venues_${stamp}.pdf`);
  }
}
