import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';

interface BackupStatusRow {
  name: string;
  localRows: number;
  chainCreatedAt: number | null;
  chainUpdatedAt: number | null;
}

const SETTING_LABELS: Record<string, string> = {
  menu_config:         'Menu Configuration',
  user_menu_config:    'Per-User Menu Overrides',
  approval_policy:     'Approval Policy',
  approval_user_roles: 'Approval User Roles',
  external_integrations: 'External API Integrations',
  integration_services:  'Integration Service Links',
  user_system_function_config: 'Per-User System Functions',
};

@Component({
  selector: 'app-settings-backup',
  templateUrl: './backup.page.html',
  styleUrls: ['./backup.page.scss'],
  standalone: true,
  imports: [CommonModule, HeaderComponent],
})
export class SettingsBackupPage implements OnInit {
  private apiService     = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);

  rows    = signal<BackupStatusRow[]>([]);
  loading = signal(false);
  busy    = signal(false);

  labelFor(name: string): string {
    return SETTING_LABELS[name] ?? name;
  }

  ngOnInit() {}

  async ionViewDidEnter() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.rows.set(await this.apiService.vaultSettingsBackupStatus());
    } finally {
      this.loading.set(false);
    }
  }

  async backupAll() {
    if (this.busy()) return;
    const ok = await this.alertService.show(
      'Backup settings',
      'All settings tables will be encrypted and backed up on-chain now. Continue?',
      'Backup',
    );
    if (!ok) return;
    this.busy.set(true);
    this.loadingService.show('Backing up...');
    try {
      const res = await this.apiService.vaultSettingsBackupRun();
      const failed = (res?.results ?? []).filter((r: any) => r.error);
      if (res?.error || failed.length) {
        this.alertService.show('Error', res?.error || failed.map((r: any) => `${r.table}: ${r.error}`).join('\n'));
      }
      await this.load();
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }

  async restore(row: BackupStatusRow) {
    if (this.busy()) return;
    if (row.chainUpdatedAt == null) {
      this.alertService.show('No backup', `No on-chain backup exists yet for ${this.labelFor(row.name)}.`);
      return;
    }
    const ok = await this.alertService.show(
      'Restore from chain',
      `${this.labelFor(row.name)} will be REPLACED with the on-chain backup from ` +
      `${new Date(row.chainUpdatedAt).toLocaleString()}. Current local settings for this table will be overwritten. Continue?`,
      'Restore',
    );
    if (!ok) return;
    this.busy.set(true);
    this.loadingService.show('Restoring...');
    try {
      const res = await this.apiService.vaultSettingsBackupRestore(row.name);
      const failed = (res?.results ?? []).filter((r: any) => r.error);
      if (res?.error || failed.length) {
        this.alertService.show('Error', res?.error || failed.map((r: any) => `${r.table}: ${r.error}`).join('\n'));
      }
      await this.load();
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }
}
