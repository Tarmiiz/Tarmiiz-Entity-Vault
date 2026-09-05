import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';

interface BackupStatusRow {
  name: string;
  localRows: number;
  chainCreatedAt: number | null;
  chainUpdatedAt: number | null;
}

/*
    ⚠️ ONE ENTRY PER `SETTINGS_BACKUP_TABLES` ROW ON THE ENTITY API — `labelFor()` falls back to the
    RAW TABLE NAME, so a missing entry does not fail, it shows an admin `api_endpoint_config` in a
    list of prose labels. Same hazard the platform names for MENU_LABELS / SYSTEM_FUNCTION_LABELS.

    Two were missing when this was measured on 2026-09-04 (12 tables, 10 labels): `app_config`,
    unlabelled since the table shipped 2026-07-20, and `api_endpoint_config` from Phase 26.3. Nobody
    noticed because the page still renders — the row is present and readable, just not translated,
    which is precisely why a fallback that "works" hides its own gaps. **When a table joins
    SETTINGS_BACKUP_TABLES, add its label here in the same pass.**
*/
const SETTING_LABEL_KEYS: Record<string, string> = {
  menu_config:         'settings.backup.settingLabels.menuConfig',
  app_config:          'settings.backup.settingLabels.appConfig',
  api_endpoint_config: 'settings.backup.settingLabels.apiEndpointConfig',
  user_menu_config:    'settings.backup.settingLabels.userMenuConfig',
  approval_policy:     'settings.backup.settingLabels.approvalPolicy',
  approval_user_roles: 'settings.backup.settingLabels.approvalUserRoles',
  external_integrations: 'settings.backup.settingLabels.externalIntegrations',
  user_system_function_config: 'settings.backup.settingLabels.userSystemFunctionConfig',
  user_groups:                       'settings.backup.settingLabels.userGroups',
  user_group_menu_config:            'settings.backup.settingLabels.userGroupMenuConfig',
  user_group_system_function_config: 'settings.backup.settingLabels.userGroupSystemFunctionConfig',
  user_group_members:                'settings.backup.settingLabels.userGroupMembers',
};

@Component({
  selector: 'app-settings-backup',
  templateUrl: './backup.page.html',
  styleUrls: ['./backup.page.scss'],
  standalone: true,
  imports: [CommonModule, TranslatePipe, HeaderComponent],
})
export class SettingsBackupPage implements OnInit {
  private apiService     = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);
  private utils          = inject(UtilsService);

  rows    = signal<BackupStatusRow[]>([]);
  loading = signal(false);
  busy    = signal(false);

  labelFor(name: string): string {
    const key = SETTING_LABEL_KEYS[name];
    return key ? this.translate.instant(key) : name;
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
      this.translate.instant('settings.backup.confirmBackupTitle'),
      this.translate.instant('settings.backup.confirmBackupMessage'),
      this.translate.instant('settings.backup.confirmBackupButton'),
    );
    if (!ok) return;
    this.busy.set(true);
    this.loadingService.show(this.translate.instant('settings.backup.backingUp'));
    try {
      const res = await this.apiService.vaultSettingsBackupRun();
      const failed = (res?.results ?? []).filter((r: any) => r.error);
      if (res?.error || failed.length) {
        this.alertService.show(this.translate.instant('alerts.error'), res?.error || failed.map((r: any) => `${r.table}: ${r.error}`).join('\n'));
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
      this.alertService.show(
        this.translate.instant('settings.backup.noBackupTitle'),
        this.translate.instant('settings.backup.noBackupMessage', { name: this.labelFor(row.name) }),
      );
      return;
    }
    const ok = await this.alertService.show(
      this.translate.instant('settings.backup.confirmRestoreTitle'),
      this.translate.instant('settings.backup.confirmRestoreMessage', {
        name: this.labelFor(row.name),
        date: this.utils.formatTime(row.chainUpdatedAt),
      }),
      this.translate.instant('settings.backup.restore'),
    );
    if (!ok) return;
    this.busy.set(true);
    this.loadingService.show(this.translate.instant('settings.backup.restoring'));
    try {
      const res = await this.apiService.vaultSettingsBackupRestore(row.name);
      const failed = (res?.results ?? []).filter((r: any) => r.error);
      if (res?.error || failed.length) {
        this.alertService.show(this.translate.instant('alerts.error'), res?.error || failed.map((r: any) => `${r.table}: ${r.error}`).join('\n'));
      }
      await this.load();
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }
}
