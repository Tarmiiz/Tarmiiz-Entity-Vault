import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { menuLabelFor } from '../../../../shared/constants/menu-labels';

interface MenuConfigRow {
  menuKey: string;
  enabled: boolean;
  updatedAt: number | null;
  updatedByUserId: string | null;
}

@Component({
  selector: 'app-menu-settings',
  templateUrl: './menu.page.html',
  styleUrls: ['./menu.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, HeaderComponent],
})
export class MenuSettingsPage implements OnInit {
  private apiService     = inject(ApiService);
  private features       = inject(FeaturesService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);

  rows    = signal<MenuConfigRow[]>([]);
  loading = signal(false);
  saving  = signal<string | null>(null); // menu key currently saving

  labelFor(key: string): string {
    return this.translate.instant(menuLabelFor(key));
  }

  ngOnInit() {}

  async ionViewDidEnter() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const rows = (await this.apiService.vaultMenuConfigList())
        .filter(r => this.features.modeAllows(r.menuKey)); // hide no-op toggles for the entity type
      rows.sort((a, b) => this.labelFor(a.menuKey).localeCompare(this.labelFor(b.menuKey)));
      this.rows.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  async toggle(row: MenuConfigRow, enabled: boolean) {
    if (this.saving()) return;
    const verb = this.translate.instant(enabled ? 'settings.menu.shownVerb' : 'settings.menu.hiddenVerb');
    const ok = await this.alertService.show(
      this.translate.instant('settings.menu.confirmChangeTitle'),
      this.translate.instant('settings.menu.confirmChangeMessage', { name: this.labelFor(row.menuKey), verb }),
      this.translate.instant('common.save'),
    );
    if (!ok) return;
    this.saving.set(row.menuKey);
    this.loadingService.show(this.translate.instant('common.saving'));
    try {
      const res = await this.apiService.vaultMenuConfigSet(row.menuKey, enabled);
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else {
        // Refresh the live feature map so the sidebar reflects the change without a reload.
        await this.features.refresh();
        await this.load();
      }
    } finally {
      this.loadingService.hide();
      this.saving.set(null);
    }
  }
}
