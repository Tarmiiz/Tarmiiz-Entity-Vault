import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { ExternalIntegration } from '../../../../shared/models/data.model';

// Pure-config records — the former eKYC adapter binding / live test / service links were
// retired with the direct SP integrations (2026-07-15).
const CATEGORY_SUGGESTIONS = ['payments', 'banking', 'custody', 'data', 'messaging', 'other'];
const SLUG = /^[a-z0-9_-]{2,32}$/;

@Component({
  selector: 'app-settings-external-integrations',
  templateUrl: './external-integrations.page.html',
  styleUrls: ['./external-integrations.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, HeaderComponent],
})
export class ExternalIntegrationsPage implements OnInit {
  private apiService     = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);

  integrations = signal<ExternalIntegration[]>([]);
  loading      = signal(false);
  busy         = signal(false);

  categorySuggestions = CATEGORY_SUGGESTIONS;

  // Edit / create modal state — param inputs are write-only: empty leaves the stored value.
  editVisible     = signal(false);
  createMode      = signal(false);
  editing         = signal<ExternalIntegration | null>(null);
  editName        = signal('');
  editDisplayName = signal('');
  editCategory    = signal('other');
  editEnabled     = signal(false);
  editDefault     = signal(false);
  paramValues     = signal<Record<string, string>>({});
  removedKeys     = signal<string[]>([]);
  newParams       = signal<{ key: string; value: string; secret: boolean }[]>([]);

  ngOnInit() {}

  async ionViewDidEnter() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.integrations.set(await this.apiService.vaultIntegrations());
    } finally {
      this.loading.set(false);
    }
  }

  paramsSetCount(p: ExternalIntegration): string {
    const set = p.params.filter(f => f.set).length;
    return `${set} / ${p.params.length}`;
  }

  // ─── Create / edit modal ────────────────────────────────────────────────────

  openCreate() {
    this.createMode.set(true);
    this.editing.set(null);
    this.editName.set('');
    this.editDisplayName.set('');
    this.editCategory.set('other');
    this.editEnabled.set(true);
    this.editDefault.set(false);
    this.paramValues.set({});
    this.removedKeys.set([]);
    this.newParams.set([{ key: '', value: '', secret: false }]);
    this.editVisible.set(true);
  }

  edit(p: ExternalIntegration) {
    this.createMode.set(false);
    this.editing.set(p);
    this.editName.set(p.name);
    this.editDisplayName.set(p.displayName || p.name);
    this.editCategory.set(p.category);
    this.editEnabled.set(p.enabled);
    this.editDefault.set(p.isDefault);
    this.paramValues.set({});
    this.removedKeys.set([]);
    this.newParams.set([]);
    this.editVisible.set(true);
  }

  setParam(key: string, value: string) {
    this.paramValues.set({ ...this.paramValues(), [key]: value });
  }

  isRemoved(key: string): boolean {
    return this.removedKeys().includes(key);
  }

  toggleRemoved(key: string) {
    const removed = this.removedKeys();
    this.removedKeys.set(removed.includes(key) ? removed.filter(k => k !== key) : [...removed, key]);
  }

  addNewParamRow() {
    this.newParams.set([...this.newParams(), { key: '', value: '', secret: false }]);
  }

  removeNewParamRow(index: number) {
    this.newParams.set(this.newParams().filter((_, i) => i !== index));
  }

  updateNewParam(index: number, field: 'key' | 'value' | 'secret', value: any) {
    this.newParams.set(this.newParams().map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  closeEdit() {
    this.editVisible.set(false);
    this.editing.set(null);
    this.paramValues.set({});
    this.removedKeys.set([]);
    this.newParams.set([]);
  }

  private buildParamsPayload(): Record<string, { value?: string; secret?: boolean } | null> {
    const params: Record<string, { value?: string; secret?: boolean } | null> = {};
    for (const key of this.removedKeys()) params[key] = null;
    for (const [key, value] of Object.entries(this.paramValues())) {
      if (value !== '' && !this.isRemoved(key)) params[key] = { value };
    }
    for (const row of this.newParams()) {
      const key = row.key.trim();
      if (key && row.value !== '') params[key] = { value: row.value, secret: row.secret };
    }
    return params;
  }

  async saveEdit() {
    if (this.busy()) return;
    const params = this.buildParamsPayload();

    if (this.createMode()) {
      const name = this.editName().trim().toLowerCase();
      const category = this.editCategory().trim().toLowerCase();
      if (!SLUG.test(name)) {
        this.alertService.show(
          this.translate.instant('settings.externalIntegrations.invalidNameTitle'),
          this.translate.instant('settings.externalIntegrations.invalidSlugMessage', { field: this.translate.instant('settings.externalIntegrations.nameLabel') }),
        );
        return;
      }
      if (!SLUG.test(category)) {
        this.alertService.show(
          this.translate.instant('settings.externalIntegrations.invalidCategoryTitle'),
          this.translate.instant('settings.externalIntegrations.invalidSlugMessage', { field: this.translate.instant('settings.externalIntegrations.categoryLabel') }),
        );
        return;
      }
      this.busy.set(true);
      this.loadingService.show(this.translate.instant('settings.externalIntegrations.creatingIntegration'));
      try {
        const res = await this.apiService.vaultIntegrationCreate({
          name,
          displayName: this.editDisplayName() || name,
          category,
          enabled:   this.editEnabled(),
          isDefault: this.editDefault(),
          ...(Object.keys(params).length ? { params } : {}),
        });
        if (res?.error) { this.alertService.show(this.translate.instant('settings.externalIntegrations.createFailedTitle'), res.error); return; }
        this.closeEdit();
        await this.load();
      } finally {
        this.loadingService.hide();
        this.busy.set(false);
      }
      return;
    }

    const p = this.editing();
    if (!p) return;
    this.busy.set(true);
    this.loadingService.show(this.translate.instant('settings.externalIntegrations.savingIntegration'));
    try {
      const res = await this.apiService.vaultIntegrationUpdate(p.name, {
        displayName: this.editDisplayName(),
        enabled:     this.editEnabled(),
        isDefault:   this.editDefault(),
        ...(Object.keys(params).length ? { params } : {}),
      });
      if (res?.error) { this.alertService.show(this.translate.instant('settings.externalIntegrations.saveFailedTitle'), res.error); return; }
      this.closeEdit();
      await this.load();
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }

  // ─── Row actions ────────────────────────────────────────────────────────────

  async makeDefault(p: ExternalIntegration) {
    if (this.busy() || p.isDefault) return;
    const ok = await this.alertService.show(
      this.translate.instant('settings.externalIntegrations.changeDefaultTitle'),
      this.translate.instant('settings.externalIntegrations.changeDefaultMessage', { name: p.displayName, category: p.category }),
      this.translate.instant('settings.externalIntegrations.setDefault'),
    );
    if (!ok) return;
    this.busy.set(true);
    this.loadingService.show(this.translate.instant('common.updating'));
    try {
      const res = await this.apiService.vaultIntegrationUpdate(p.name, { isDefault: true });
      if (res?.error) this.alertService.show(this.translate.instant('settings.externalIntegrations.updateFailedTitle'), res.error);
      await this.load();
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }

  async toggleEnabled(p: ExternalIntegration) {
    if (this.busy()) return;
    const verb = this.translate.instant(p.enabled ? 'settings.externalIntegrations.disableAction' : 'settings.externalIntegrations.enableAction');
    const consequence = this.translate.instant(p.enabled
      ? 'settings.externalIntegrations.disableConsequence'
      : 'settings.externalIntegrations.enableConsequence');
    const ok = await this.alertService.show(
      this.translate.instant('settings.externalIntegrations.toggleTitle', { verb }),
      this.translate.instant('settings.externalIntegrations.toggleMessage', { verb, name: p.displayName, consequence }),
      verb,
    );
    if (!ok) return;
    this.busy.set(true);
    this.loadingService.show(this.translate.instant('common.updating'));
    try {
      const res = await this.apiService.vaultIntegrationUpdate(p.name, { enabled: !p.enabled });
      if (res?.error) this.alertService.show(this.translate.instant('settings.externalIntegrations.updateFailedTitle'), res.error);
      await this.load();
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }

  async remove(p: ExternalIntegration) {
    if (this.busy()) return;
    const ok = await this.alertService.show(
      this.translate.instant('settings.externalIntegrations.deleteTitle'),
      this.translate.instant('settings.externalIntegrations.deleteMessage', { name: p.displayName }),
      this.translate.instant('common.delete'),
    );
    if (!ok) return;
    this.busy.set(true);
    this.loadingService.show(this.translate.instant('common.deleting'));
    try {
      const res = await this.apiService.vaultIntegrationDelete(p.name);
      if (res?.error) { this.alertService.show(this.translate.instant('settings.externalIntegrations.deleteFailedTitle'), res.error); return; }
      await this.load();
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }
}
