import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { Subscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";

import { ApiService } from '../../../../shared/services/api.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { ModalServiceAddService } from '../modals/modal-service-add/modal-service-add.service';
import { ModalServiceAddComponent } from '../modals/modal-service-add/modal-service-add.component';

import { Service, User } from '../../../../shared/models/data.model';
import { AuthService } from '../../../../shared/services/auth.service';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    ModalServiceAddComponent,
  ]
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private socketService = inject(SocketService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private serviceAddService = inject(ModalServiceAddService);
  private utils = inject(UtilsService);
  private authService = inject(AuthService);

  userInfo!: User;
  loadingServices: boolean = false;
  showAllServices = signal(false);

  servicesCount = 0
  services = signal<Service[]>([]);
  servicesSearchTerm = signal('');

  filterState = signal<string>('');
  filterVerificationLevel = signal<string>('');

  uniqueVerificationLevels = computed(() =>
    [...new Map(this.services().map(s => [s.verificationLevel, s.verificationLevelName])).entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
  );

  clearFilters() {
    this.filterState.set('');
    this.filterVerificationLevel.set('');
  }

  private _socketSub: Subscription | null = null;

  constructor() {}

  ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.services.set([]);
    this.servicesCount = 0;
  }

  async ionViewDidEnter() {
    this.loadingServices = true;
    await this.listServices();
    this.loadingServices = false;
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.listServices());
  }

  ionViewWillLeave() {
    this._socketSub?.unsubscribe();
    this._socketSub = null;
  }
  
  getStateClass(stateId: number | undefined): string {
    if (stateId === undefined) return 'bg-gray-100 text-gray-800';
    switch(stateId) {
      case 1: return 'bg-yellow-100 text-yellow-800'; // Initiated
      case 2: return 'bg-green-100 text-green-800';   // Active
      case 3: return 'bg-orange-100 text-orange-800'; // Suspended
      case 4: return 'bg-red-100 text-red-800';       // Deactivated
      default: return 'bg-gray-100 text-gray-800';
    }
  } 

  async onToggleChange(event: Event) {
    const checkbox = event.target as HTMLInputElement;
    this.showAllServices.set(checkbox.checked);
    await this.listServices();
  } 

  private readonly stateNames: Record<number, string> = {
    0: 'Inactive', 1: 'Initiated', 2: 'Active', 3: 'Suspended', 4: 'Deactivated',
  };

  private mapVaultService(raw: any): Service {
    const meta = typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {};
    return {
      address: raw.address,
      entity: raw.entity ?? '',
      entityName: raw.entity_name ?? raw.entity ?? '',
      name: raw.name,
      metadata: typeof raw.metadata === 'object' ? JSON.stringify(raw.metadata ?? {}) : (raw.metadata ?? ''),
      description: meta.description ?? '',
      email: meta.email ?? '',
      mobile: meta.mobile ?? '',
      website: meta.website ?? '',
      countryCode: raw.country_code ?? 0,
      countryName: raw.country_name ?? '',
      verificationLevel: raw.verification_level ?? 0,
      verificationLevelName: raw.verification_level_name ?? String(raw.verification_level ?? ''),
      regulator: raw.regulator ?? '',
      regulatorName: raw.regulator_name ?? '',
      regulatorSymbol: '',
      suspended: raw.suspended === true || raw.suspended === 1,
      state: raw.state ?? 0,
      stateName: raw.state_name ?? this.stateNames[raw.state] ?? String(raw.state ?? ''),
    } as Service;
  }

  async listServices() {
    this.loadingService.show('Loading data...');
    this.services.set([]);
    const result = await this.apiService.vaultGetServices(0, 500);
    if (result) {
      this.servicesCount = result.count;
      this.services.set(result.services.map((s: any) => this.mapVaultService(s)));
    }
    this.loadingService.hide();
  }

  async openAddModal() {
    const data = await this.serviceAddService.show();
    if (!data) return;

    this.loadingService.show('Creating service...');
    try {
      const result = await this.apiService.vaultCreateService({
        name: data.name,
        metadata: JSON.stringify({ description: data.description, website: data.website, email: data.email, mobile: data.mobile }),
        verification_level: data.verificationLevel,
        country_code: environment.countryCode,
        regulator: data.regulator,
      });
      if (result) {
        await this.listServices();
      } else {
        this.alertService.show('Error', 'Failed to create service.');
      }
    } catch (error) {
      this.alertService.show('Error', 'An unexpected error occurred.');
    } finally {
      this.loadingService.hide();
    }
  }

  viewDetails(service: Service) {
    this.router.navigate(['/authorized/services/details/' + service.address]);
  }

  filteredServices = computed(() => {
    const state = this.filterState();
    const level = this.filterVerificationLevel();
    return this.services().filter(s =>
      (!state || String(s.state) === state) &&
      (!level || String(s.verificationLevel) === level)
    );
  });  

  onServicesSearch(event: Event) {
    this.servicesSearchTerm.set((event.target as HTMLInputElement).value);
  }

  exportExcel() {
    const rows = this.filteredServices().map(s => ({
      'Name': s.name,
      'Verification Level': s.verificationLevelName,
      ...(this.showAllServices() ? { 'Regulator': s.regulatorSymbol } : {}),
      'State': s.stateName,
      'Suspended': s.suspended ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Services');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `services_${stamp}.xlsx`);
  }

  exportPdf() {
    const services = this.filteredServices();
    const doc = new jsPDF({ orientation: 'landscape' });
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Services', pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${this.utils.formatDate(Math.floor(Date.now() / 1000))}`, pad, 21);

    const filterParts = [
      `Verification Level: ${this.filterVerificationLevel() ? (this.uniqueVerificationLevels().find(l => String(l[0]) === this.filterVerificationLevel())?.[1] ?? this.filterVerificationLevel()) : 'None'}`,
      `State: ${this.filterState() || 'None'}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Filters: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    const showRegulator = this.showAllServices();
    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      head: [[ '#', 'Name', 'Verification Level', ...(showRegulator ? ['Regulator'] : []), 'State' ]],
      body: services.map((s, i) => [
        i + 1,
        s.name,
        s.verificationLevelName,
        ...(showRegulator ? [s.regulatorSymbol] : []),
        s.suspended ? `${s.stateName} (Suspended)` : s.stateName,
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    doc.save(`services_${stamp}.pdf`);
  }

}
