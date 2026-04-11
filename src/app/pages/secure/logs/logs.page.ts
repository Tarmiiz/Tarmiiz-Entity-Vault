import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { HeaderComponent } from "../../../shared/components/header/header.component";
import { ApiService } from '../../../shared/services/api.service';
import { StateChangeLog, ActivityLog } from '../../../shared/models/data.model';

@Component({
  selector: 'app-logs',
  templateUrl: './logs.page.html',
  styleUrls: ['./logs.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HeaderComponent,
  ]
})
export class LogsPage implements OnInit {

  private apiService = inject(ApiService);

  activeTab = signal<'state' | 'activity'>('state');

  // State change logs
  stateLogs = signal<StateChangeLog[]>([]);
  stateTotal = signal(0);
  statePage = signal(0);
  stateTypeFilter = signal('');

  // Activity logs
  activityLogs = signal<ActivityLog[]>([]);
  activityTotal = signal(0);
  activityPage = signal(0);
  activityCategoryFilter = signal('');

  readonly pageSize = 25;

  stateTypes = ['asset', 'asset_service', 'service', 'subscription', 'entity', 'user'];
  activityCategories = ['navigation', 'export', 'filter', 'view', 'auth', 'action'];

  ngOnInit() {
    this.loadStateLogs();
    this.loadActivityLogs();
  }

  switchTab(tab: 'state' | 'activity') {
    this.activeTab.set(tab);
  }

  // ─── State Change Logs ──────────────────────────────────────────────────────

  async loadStateLogs() {
    const start = this.statePage() * this.pageSize + 1;
    const type = this.stateTypeFilter() || undefined;
    const data = await this.apiService.vaultGetAllStateChangeLogs(start, this.pageSize, type);
    if (data) {
      this.stateLogs.set(data.logs || []);
      this.stateTotal.set(data.count || 0);
    }
  }

  stateNextPage() {
    if ((this.statePage() + 1) * this.pageSize < this.stateTotal()) {
      this.statePage.update(p => p + 1);
      this.loadStateLogs();
    }
  }

  statePrevPage() {
    if (this.statePage() > 0) {
      this.statePage.update(p => p - 1);
      this.loadStateLogs();
    }
  }

  onStateTypeChange() {
    this.statePage.set(0);
    this.loadStateLogs();
  }

  // ─── Activity Logs ──────────────────────────────────────────────────────────

  async loadActivityLogs() {
    const start = this.activityPage() * this.pageSize + 1;
    const category = this.activityCategoryFilter() || undefined;
    const data = await this.apiService.vaultGetActivityLogs(start, this.pageSize, category);
    if (data) {
      this.activityLogs.set(data.logs || []);
      this.activityTotal.set(data.count || 0);
    }
  }

  activityNextPage() {
    if ((this.activityPage() + 1) * this.pageSize < this.activityTotal()) {
      this.activityPage.update(p => p + 1);
      this.loadActivityLogs();
    }
  }

  activityPrevPage() {
    if (this.activityPage() > 0) {
      this.activityPage.update(p => p - 1);
      this.loadActivityLogs();
    }
  }

  onActivityCategoryChange() {
    this.activityPage.set(0);
    this.loadActivityLogs();
  }

  formatDate(ts: number): string {
    if (!ts) return '-';
    return new Date(ts).toLocaleString();
  }

  formatAction(action: string): string {
    return action.replace(/_/g, ' ');
  }

  truncate(value: string, length = 20): string {
    if (!value) return '-';
    return value.length > length ? value.substring(0, length) + '...' : value;
  }
}
