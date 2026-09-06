import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../../shared/components/header/header.component';
import { ApiService } from '../../../../../shared/services/api.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { UserGroup } from '../../../../../shared/models/data.model';
import { menuLabelFor } from '../../../../../shared/constants/menu-labels';
import { systemFunctionLabelFor } from '../../../../../shared/constants/system-function-labels';
import { PaginatorComponent, pageSlice } from '../../../../../shared/components/paginator/paginator.component';
import { LicensePillComponent, LicenseStatus } from '../../../../../shared/components/license-pill/license-pill.component';

interface GroupMenuRow {
  menuKey: string;
  tenantEnabled: boolean;
  groupEnabled: boolean | null; // null ⇒ inherit role default
  effective: boolean;
  // Surfaced by the Entity API (licenseSurfacing.js). OPTIONAL because an older API response
  // simply omits it, and the pill renders nothing for an absent value.
  license?: LicenseStatus | null;
}

interface GroupSystemFunctionRow {
  functionKey: string;
  defaultEnabled: boolean;
  groupEnabled: boolean | null; // null ⇒ inherit role default
  effective: boolean;
  // Surfaced by the Entity API (licenseSurfacing.js). OPTIONAL because an older API response
  // simply omits it, and the pill renders nothing for an absent value.
  license?: LicenseStatus | null;
}

@Component({
  selector: 'app-user-group-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, HeaderComponent, RouterLink, PaginatorComponent, LicensePillComponent],
})
export class UserGroupDetailsPage implements OnInit {
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private apiService     = inject(ApiService);
  private features       = inject(FeaturesService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);

  groupId = signal<string>('');
  group   = signal<UserGroup | undefined>(undefined);

  menuRows    = signal<GroupMenuRow[]>([]);
  menuLoading = signal(false);
  menuSaving  = signal<string | null>(null);

  sysFnRows    = signal<GroupSystemFunctionRow[]>([]);
  sysFnLoading = signal(false);
  sysFnSaving  = signal<string | null>(null);

  members        = signal<{ userId: string; assignedAt: number }[]>([]);
  /** 1-based, per frontend Standard 1.5. */
  membersPage = signal(1);
  membersPageSize = signal(25);
  pagedMembers = computed(() => pageSlice(this.members(), this.membersPage(), this.membersPageSize()));
  membersLoading = signal(false);

  editName        = signal('');
  editDescription = signal('');
  infoSaving      = signal(false);

  ngOnInit() {}

  labelFor(key: string): string { return this.translate.instant(menuLabelFor(key)); }
  fnLabelFor(key: string): string { return this.translate.instant(systemFunctionLabelFor(key)); }

  roleLabel(role: number | undefined): string {
    return this.translate.instant(Number(role) === 3 ? 'role.viewer' : 'users.roles.executive');
  }

  isViewerGroup(): boolean {
    return Number(this.group()?.role) === 3;
  }

  async ionViewWillEnter() {
    const groupId = this.route.snapshot.paramMap.get('groupId');
    if (groupId) this.groupId.set(groupId);
    await this.loadGroup();
    await Promise.all([this.loadMenuConfig(), this.loadSystemFunctionsConfig(), this.loadMembers()]);
  }

  async loadGroup() {
    this.loadingService.show(this.translate.instant('common.loadingData'));
    try {
      const group = await this.apiService.vaultUserGroupGet(this.groupId());
      if (!group) {
        this.router.navigate(['/authorized/settings/user-groups']);
        return;
      }
      this.group.set(group);
      this.editName.set(group.name);
      this.editDescription.set(group.description || '');
    } finally {
      this.loadingService.hide();
    }
  }

  async saveInfo() {
    const g = this.group();
    const name = this.editName().trim();
    if (!g || !name || this.infoSaving()) return;
    this.infoSaving.set(true);
    this.loadingService.show(this.translate.instant('common.saving'));
    try {
      const res = await this.apiService.vaultUserGroupUpdate(g.groupId, {
        name,
        description: this.editDescription().trim(),
      });
      if (res?.error) this.alertService.show(this.translate.instant('alerts.error'), res.error);
      else await this.loadGroup();
    } finally {
      this.loadingService.hide();
      this.infoSaving.set(false);
    }
  }

  async loadMenuConfig() {
    this.menuLoading.set(true);
    try {
      const rows = (await this.apiService.vaultUserGroupMenuConfigList(this.groupId()))
        // Tenant-disabled or mode-hidden keys are moot — the tenant map stays the ceiling.
        .filter(r => r.tenantEnabled && this.features.modeAllows(r.menuKey));
      rows.sort((a, b) => this.labelFor(a.menuKey).localeCompare(this.labelFor(b.menuKey)));
      this.menuRows.set(rows);
    } catch {
      this.menuRows.set([]);
    } finally {
      this.menuLoading.set(false);
    }
  }

  async toggleMenu(row: GroupMenuRow, enabled: boolean) {
    if (this.menuSaving()) return;
    this.menuSaving.set(row.menuKey);
    this.loadingService.show(this.translate.instant('common.saving'));
    try {
      const res = await this.apiService.vaultUserGroupMenuConfigSet(this.groupId(), row.menuKey, enabled);
      if (res?.error) this.alertService.show(this.translate.instant('alerts.error'), res.error);
      else await this.loadMenuConfig();
    } finally {
      this.loadingService.hide();
      this.menuSaving.set(null);
    }
  }

  async loadSystemFunctionsConfig() {
    this.sysFnLoading.set(true);
    try {
      const rows = await this.apiService.vaultUserGroupSystemFunctionConfigList(this.groupId());
      rows.sort((a, b) => this.fnLabelFor(a.functionKey).localeCompare(this.fnLabelFor(b.functionKey)));
      this.sysFnRows.set(rows);
    } catch {
      this.sysFnRows.set([]);
    } finally {
      this.sysFnLoading.set(false);
    }
  }

  async toggleSystemFunction(row: GroupSystemFunctionRow, enabled: boolean) {
    if (this.sysFnSaving()) return;
    this.sysFnSaving.set(row.functionKey);
    this.loadingService.show(this.translate.instant('common.saving'));
    try {
      const res = await this.apiService.vaultUserGroupSystemFunctionConfigSet(this.groupId(), row.functionKey, enabled);
      if (res?.error) this.alertService.show(this.translate.instant('alerts.error'), res.error);
      else await this.loadSystemFunctionsConfig();
    } finally {
      this.loadingService.hide();
      this.sysFnSaving.set(null);
    }
  }

  async loadMembers() {
    this.membersLoading.set(true);
    try {
      this.members.set(await this.apiService.vaultUserGroupMembers(this.groupId()));
    } catch {
      this.members.set([]);
    } finally {
      this.membersLoading.set(false);
    }
  }

  async deleteGroup() {
    const g = this.group();
    if (!g) return;
    if (this.members().length > 0) {
      this.alertService.show(
        this.translate.instant('settings.userGroups.details.deleteBlockedTitle'),
        this.translate.instant('settings.userGroups.details.deleteBlockedMsg', { count: this.members().length }),
      );
      return;
    }
    const ok = await this.alertService.show(
      this.translate.instant('settings.userGroups.details.deleteConfirmTitle'),
      this.translate.instant('settings.userGroups.details.deleteConfirmMsg', { name: g.name }),
      this.translate.instant('common.delete'),
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('settings.userGroups.details.deleting'));
    try {
      const res = await this.apiService.vaultUserGroupDelete(g.groupId);
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
        return;
      }
      this.router.navigate(['/authorized/settings/user-groups']);
    } finally {
      this.loadingService.hide();
    }
  }
}
