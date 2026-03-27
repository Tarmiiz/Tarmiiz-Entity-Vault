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
import { UtilsService } from '../../../../shared/services/utils.service';

import { Subscription } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    HeaderComponent,
  ]
})
export class ListPage implements OnInit {
  private rpcService = inject(RpcService);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  utils = inject(UtilsService);

  loadingServices: boolean = false;

  subscriptionsCount = 0
  subscriptions = signal<Subscription[]>([]);

  filterService = signal<string>('');
  filterState = signal<string>('');

  uniqueServices = computed(() =>
    [...new Map(this.subscriptions().map(s => [s.service, s.serviceName])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
  );

  constructor() {}

  ngOnInit() {}


  async ionViewWillEnter() {
    this.subscriptions.set([]);
    this.subscriptionsCount = 0;
  }  

  async ionViewDidEnter() {
    this.loadingServices = true;
    await this.listSubscriptions();
    this.loadingServices = false;
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

  async listSubscriptions() {
    this.loadingService.show('Loading data...');
    const result = await this.rpcService.subscriptionsListAllByEntity(1, 1000);
    if(result.result) {
      this.subscriptionsCount = result.result.count;
      this.subscriptions.set(result.result.subscriptions);
      // console.log('services', this.subscriptions());
    }
    else {
      console.log(result.error);
    }
    this.loadingService.hide();
  }  

  viewDetails(subscription: Subscription) {
    this.router.navigate(['/authorized/subscriptions/details/' + subscription.subscription]);
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
    doc.text(`Generated: ${this.utils.formatDate(Math.floor(Date.now() / 1000))}`, pad, 21);

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
    doc.save(`subscriptions_${stamp}.pdf`);
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
  }

}
