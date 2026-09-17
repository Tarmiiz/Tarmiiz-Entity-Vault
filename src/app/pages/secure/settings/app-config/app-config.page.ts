import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { FeaturesService } from '../../../../shared/services/features.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { AppConfigItem } from '../../../../shared/models/data.model';
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';
import { SubTabRailComponent } from '../../../../shared/components/sub-tab-rail/sub-tab-rail.component';
import { TabDef } from '../../../../shared/components/tabs/tabs.component';

@Component({
  selector: 'app-settings-app-config',
  templateUrl: './app-config.page.html',
  styleUrls: ['./app-config.page.scss'],
  standalone: true,
  imports: [LoadingStateComponent, CommonModule, FormsModule, TranslatePipe, HeaderComponent, SubTabRailComponent],
})
export class AppConfigPage implements OnInit {
  private apiService     = inject(ApiService);
  private features       = inject(FeaturesService);
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

  // ─── Section rail (Standard 2.1) ────────────────────────────────────────────
  //
  // FIFTEEN app_config categories plus the on-chain API address, stacked as flat
  // cards down one scroll. Standard 2.1's test is "does it remove a scroll, or add
  // a click?" — sixteen sections answer it.
  //
  // ⚠️ `ON_CHAIN` is a PSEUDO-CATEGORY. The API address is read from the CHAIN (an
  // external-contract registration), so it has no `category` to group by, but it is
  // still something an admin comes to this page to check. The slug deliberately does
  // not collide with the real `chain` category, labelled "Blockchain".
  //
  // Named `section*`, not `group*`, to match the Regulator twin — there the name
  // `group` is already a private grouping METHOD on the class, and a signal of the
  // same name would shadow it and break `load()`. Same names both sides, one hazard
  // avoided in both.

  /** The pseudo-category holding the chain-read setting. */
  readonly ON_CHAIN = 'onchain';

  section = signal<string | null>(null);

  sections = computed<TabDef[]>(() => {
    const out: TabDef[] = [{
      key: this.ON_CHAIN,
      label: 'settings.appConfig.categories.onchain',
      count: 1,
    }];
    for (const c of this.categories()) {
      // Resolved label, not a key: `categoryLabel` falls back to the raw slug for an
      // unlabelled category, and a rail item must never render blank.
      out.push({ key: c.category, label: this.categoryLabel(c.category), count: c.items.length });
    }
    return out;
  });

  /** Selected section, falling back to the first rail item so the pane is never blank. */
  activeSection = computed(() => {
    const ss = this.sections();
    const sel = this.section();
    return sel && ss.some((s) => s.key === sel) ? sel : (ss[0]?.key ?? null);
  });

  /** The one category on show, or null while the on-chain pane is selected. */
  activeCategory = computed(() =>
    this.categories().find((c) => c.category === this.activeSection()) ?? null);

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
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.load();
        // VAULT_MODE lives in this registry and drives the sidebar, so re-hydrate the
        // feature map here rather than making the admin re-login to see the effect.
        await this.features.refresh();
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
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.load();
        await this.features.refresh();
      }
    } finally {
      this.loadingService.hide();
      this.saving.set(null);
    }
  }
}
