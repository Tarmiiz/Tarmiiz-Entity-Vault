import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../../shared/components/header/header.component';
import { ApiService } from '../../../../../shared/services/api.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { UserGroup } from '../../../../../shared/models/data.model';
import { ModalGroupAddComponent } from '../modals/modal-group-add/modal-group-add.component';
import { ModalGroupAddService } from '../modals/modal-group-add/modal-group-add.service';

@Component({
  selector: 'app-user-groups',
  templateUrl: './user-groups.page.html',
  styleUrls: ['./user-groups.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, HeaderComponent, ModalGroupAddComponent],
})
export class UserGroupsPage implements OnInit {
  private apiService      = inject(ApiService);
  private router          = inject(Router);
  private loadingService  = inject(LoadingService);
  private alertService    = inject(AlertService);
  private groupAddService = inject(ModalGroupAddService);
  private translate       = inject(TranslateService);

  groups  = signal<UserGroup[]>([]);
  loading = signal(false);

  ngOnInit() {}

  async ionViewDidEnter() {
    await this.load();
  }

  roleLabel(role: number): string {
    return this.translate.instant(role === 3 ? 'role.viewer' : 'users.roles.executive');
  }

  roleClass(role: number): string {
    return role === 3 ? 'bg-sky-100 text-sky-800' : 'bg-indigo-100 text-indigo-800';
  }

  async load() {
    this.loading.set(true);
    try {
      this.groups.set(await this.apiService.vaultUserGroupsList());
    } catch {
      this.groups.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  openDetails(group: UserGroup) {
    this.router.navigate(['/authorized/settings/user-groups/details', group.groupId]);
  }

  async openAddModal() {
    const result = await this.groupAddService.show();
    if (!result) return;
    this.loadingService.show(this.translate.instant('settings.userGroups.creating'));
    try {
      const res = await this.apiService.vaultUserGroupCreate({
        name: result.name,
        description: result.description || undefined,
        role: result.role,
      });
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
        return;
      }
      await this.load();
      const created = res?.group;
      if (created?.groupId) this.router.navigate(['/authorized/settings/user-groups/details', created.groupId]);
    } finally {
      this.loadingService.hide();
    }
  }
}
