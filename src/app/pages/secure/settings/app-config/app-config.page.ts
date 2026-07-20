import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { AppConfigItem } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-settings-app-config',
  templateUrl: './app-config.page.html',
  styleUrls: ['./app-config.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, HeaderComponent],
})
export class AppConfigPage implements OnInit {
  private apiService     = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);

  categories = signal<{ category: string; items: AppConfigItem[] }[]>([]);
  loading    = signal(false);
  saving     = signal<string | null>(null);          // key currently saving
  edits      = signal<Record<string, string>>({});   // in-progress input value per key

  // On-chain API endpoint (entity's `api` external-contract registration — NOT an app_config
  // env value). READ-ONLY here: it must match the wallet the Entity API signs with, so rotation
  // is a coordinated ops task, not a dashboard edit — we only surface it for verification.
  apiAddress = signal<string>('');

  ngOnInit() {}

  async ionViewDidEnter() {
    await Promise.all([this.load(), this.loadApi()]);
  }

  async loadApi() {
    const api = await this.apiService.vaultGetExternalContract('api');
    this.apiAddress.set(api ?? '');
  }

  async load() {
    this.loading.set(true);
    try {
      const config = await this.apiService.getAppConfig();
      // Group by category, preserving first-seen category order.
      const order: string[] = [];
      const byCat: Record<string, AppConfigItem[]> = {};
      for (const item of config) {
        if (!byCat[item.category]) { byCat[item.category] = []; order.push(item.category); }
        byCat[item.category].push(item);
      }
      this.categories.set(order.map(c => ({ category: c, items: byCat[c] })));

      // Seed the edit buffer from each non-secret value ('' for secrets).
      const seed: Record<string, string> = {};
      for (const item of config) {
        seed[item.key] = item.type === 'secret' ? '' : (item.value ?? '');
      }
      this.edits.set(seed);
    } finally {
      this.loading.set(false);
    }
  }

  categoryLabel(category: string): string {
    const key = 'settings.appConfig.categories.' + category;
    const translated = this.translate.instant(key);
    return translated === key ? category : translated;
  }

  editValue(key: string): string {
    return this.edits()[key] ?? '';
  }

  setEdit(key: string, value: string) {
    this.edits.set({ ...this.edits(), [key]: value });
  }

  // A non-bool value row is dirty when the edit buffer differs from the stored value.
  isDirty(item: AppConfigItem): boolean {
    if (item.type === 'secret') return (this.edits()[item.key] ?? '') !== '';
    return (this.edits()[item.key] ?? '') !== (item.value ?? '');
  }

  // ─── Bool toggle ─────────────────────────────────────────────────────────────

  async toggleBool(item: AppConfigItem, checked: boolean) {
    if (this.saving()) return;
    const ok = await this.alertService.show(
      this.translate.instant('settings.appConfig.confirmChangeTitle'),
      this.translate.instant('settings.appConfig.confirmChangeMessage', { name: item.label }),
      this.translate.instant('common.save'),
    );
    if (!ok) return;
    await this.save(item, checked ? 'true' : 'false');
  }

  // ─── Save a text / number / secret value ─────────────────────────────────────

  async saveValue(item: AppConfigItem) {
    if (this.saving()) return;
    if (!this.isDirty(item)) return;
    await this.save(item, this.edits()[item.key] ?? '');
  }

  private async save(item: AppConfigItem, value: string) {
    if (this.saving()) return;
    this.saving.set(item.key);
    this.loadingService.show(this.translate.instant('common.saving'));
    try {
      const res = await this.apiService.setAppConfig(item.key, value);
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.load();
      }
    } finally {
      this.loadingService.hide();
      this.saving.set(null);
    }
  }

  // ─── Reset a key to its default ──────────────────────────────────────────────

  async reset(item: AppConfigItem) {
    if (this.saving()) return;
    const ok = await this.alertService.show(
      this.translate.instant('settings.appConfig.confirmResetTitle'),
      this.translate.instant('settings.appConfig.confirmResetMessage', { name: item.label }),
      this.translate.instant('settings.appConfig.reset'),
    );
    if (!ok) return;
    this.saving.set(item.key);
    this.loadingService.show(this.translate.instant('common.saving'));
    try {
      const res = await this.apiService.resetAppConfig(item.key);
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.load();
      }
    } finally {
      this.loadingService.hide();
      this.saving.set(null);
    }
  }
}
