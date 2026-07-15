import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { Subscription as RxSubscription } from 'rxjs';

import { HeaderComponent } from "../../../../shared/components/header/header.component";
import { LiveIndicatorComponent } from "../../../../shared/components/live-indicator/live-indicator.component";

import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { AuditService } from '../../../../shared/services/audit.service';
import { applyPdfFooter } from '../../../../shared/utils/pdf-export.utils';

import { ModalAddSubscriptionComponent } from '../modals/modal-add-subscription/modal-add-subscription.component';
import { ModalAddSubscriptionService } from '../modals/modal-add-subscription/modal-add-subscription.service';

import { Subscription, User } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
    LiveIndicatorComponent,
    ModalAddSubscriptionComponent, TranslatePipe,
  ]
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private socketService = inject(SocketService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  utils = inject(UtilsService);
  private auditService = inject(AuditService);
  private addSubscriptionService = inject(ModalAddSubscriptionService);
  features = inject(FeaturesService);

  userInfo!: User;
  loadingServices: boolean = false;
  refreshing = signal(false);

  subscriptionsCount = 0
  subscriptions = signal<Subscription[]>([]);

  filterService = signal<string>('');
  filterState = signal<string>('');

  uniqueServices = computed(() =>
    [...new Map(this.subscriptions().map(s => [s.service, s.serviceName])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  private _socketSub: RxSubscription | null = null;

  constructor() {}

  ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    this.subscriptions.set([]);
    this.subscriptionsCount = 0;
  }

  async ionViewDidEnter() {
    this.loadingServices = true;
    await this.listSubscriptions();
    this.loadingServices = false;
    this._socketSub = this.socketService.vaultUpdated$.subscribe(() => this.listSubscriptions(true));
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

  private readonly stateNames: Record<number, string> = {
    0: 'Inactive', 1: 'Initiated', 2: 'Active', 3: 'Suspended', 4: 'Deactivated',
  };

  private mapVaultSubscription(raw: any): Subscription {
    return {
      subscription: raw.address,
      entity: raw.entity ?? '',
      entityName: raw.entity_name ?? '',
      service: raw.service ?? '',
      serviceName: raw.service_name ?? raw.service ?? '',
      validator: raw.validator ?? '',
      validatorName: raw.validator_name ?? '',
      validatorVerificationId: raw.validator_level ?? 0,
      validatorTimestamp: raw.validator_trx_ts ?? 0,
      regulator: raw.regulator ?? '',
      regulatorName: raw.regulator_name ?? '',
      createdAt: raw.created_at ?? 0,
      suspended: raw.suspended === true || raw.suspended === 1,
      state: raw.state ?? 0,
      stateName: raw.account_state_name ?? this.stateNames[raw.state] ?? String(raw.state ?? ''),
    } as Subscription;
  }

  async listSubscriptions(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show('Loading data...');
    try {
      const result = await this.apiService.vaultGetSubscriptions(undefined, 0, 1000);
      if (result) {
        this.subscriptionsCount = result.count;
        this.subscriptions.set(result.subscriptions.map((s: any) => this.mapVaultSubscription(s)));
      }
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  viewDetails(subscription: Subscription) {
    this.router.navigate(['/authorized/subscriptions/details/' + subscription.subscription]);
  }

  async openAddSubscription() {
    const result = await this.addSubscriptionService.show();
    if (result?.subscriptionAddress) {
      await this.alertService.show('Subscription Created', 'Subscription address: ' + result.subscriptionAddress);
      await this.listSubscriptions();
    }
  }

  filteredSubscriptions = computed(() => {
    const service = this.filterService();
    const state = this.filterState();
    return this.subscriptions().filter(s =>
      (!service || s.service === service) &&
      (!state || String(s.state) === state)
    );
  });

  clearFilters() {
    this.filterService.set('');
    this.filterState.set('');
  }

  exportPdf() {
    const subs = this.filteredSubscriptions();
    const doc = new jsPDF();
    const pad = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Subscriptions', pad, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const filterParts = [
      `Service: ${this.filterService() || 'None'}`,
      `State: ${this.filterState() || 'None'}`,
    ];
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Filters: ${filterParts.join('  |  ')}`, pad, 27);
    doc.setTextColor(0);

    const stateCounts = subs.reduce((acc, s) => {
      acc[s.stateName] = (acc[s.stateName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const stateRows = Object.entries(stateCounts).map(([name, count]) => [name, count]);
    const totalActive = subs.filter(s => s.state === 2).length;
    const totalSuspended = subs.filter(s => s.suspended).length;

    autoTable(doc, {
      startY: 34,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
      },
      head: [[
        { content: 'State' },
        { content: 'Count', styles: { halign: 'center' } },
        { content: 'Active', styles: { halign: 'center' } },
        { content: 'Suspended', styles: { halign: 'center' } },
      ]],
      body: [
        ['All', subs.length, totalActive, totalSuspended],
        ...stateRows,
      ],
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      margin: { left: pad, right: pad },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [74, 85, 104] },
      columnStyles: {
        0: { cellWidth: 10 },
      },
      head: [[
        { content: '#' },
        { content: 'Created' },
        { content: 'Subscription Address' },
        { content: 'Service' },
        { content: 'State' },
      ]],
      body: subs.map((s, i) => [
        i + 1,
        this.utils.formatDate(s.createdAt),
        s.subscription,
        s.serviceName,
        `${s.stateName}${s.suspended ? ' (Suspended)' : ''}`,
      ]),
    });

    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    applyPdfFooter(doc, { exportedBy: this.authService.userInfo?.name });
    doc.save(`subscriptions_${stamp}.pdf`);
    this.auditService.logExport('pdf', 'subscriptions');
  }

  exportExcel() {
    const rows = this.filteredSubscriptions().map(s => ({
      'Created': this.utils.formatDate(s.createdAt),
      'Subscription': s.subscription,
      'Service': s.serviceName,
      'State': s.stateName,
      'Suspended': s.suspended ? 'Yes' : 'No',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subscriptions');

    const now = new Date();
    const stamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    XLSX.writeFile(wb, `subscriptions_${stamp}.xlsx`);
    this.auditService.logExport('excel', 'subscriptions');
  }

}
