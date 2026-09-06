import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { ApiEndpointItem } from '../../../../shared/models/data.model';
import { sectionLabelKey } from '../../../../shared/constants/api-endpoint-labels';
import { LicensePillComponent, LicenseStatus } from '../../../../shared/components/license-pill/license-pill.component';

/**
 * Settings → API Endpoints (Phase 26.7).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PAGE GOVERNS, AND WHY THE COPY SAYS IT THAT WAY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ These switches control **what our EXTERNAL SYSTEMS may drive** — nothing else. A disabled
 * endpoint 403s NON-HUMAN principals only; a logged-in Vault user is never affected.
 *
 * That is not a softening of the feature, it is what makes it safe to hand an admin. Integration
 * routes serve BOTH populations: `GET /assets` backs the Vault's own assets page as well as a
 * partner's nightly sync. A switch that blocked everyone would let an admin brick a Vault page
 * from a settings toggle, with nothing in the UI able to explain why the page they were just
 * looking at went blank. So the title and description say "external systems", never "disable
 * endpoint" — the latter would be a promise this does not keep.
 *
 * ⚠️ THERE IS DELIBERATELY NO `FeaturesService` CHANGE AND NO `features/me` FIELD. Nothing in
 * this UI needs to hide, because the Vault is never blocked by these toggles. A `features` field
 * would imply a page → endpoint dependency map, which is exactly the hand-maintained coupling
 * that drifts the moment a page adds a call.
 */
@Component({
  selector: 'app-settings-api-endpoints',
  templateUrl: './api-endpoints.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, HeaderComponent, LicensePillComponent],
})
export class ApiEndpointsPage implements OnInit {
  private apiService     = inject(ApiService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);

  sections = signal<{ section: string; items: ApiEndpointItem[]; license?: LicenseStatus | null }[]>([]);
  loading  = signal(false);
  saving   = signal<string | null>(null);   // endpoint key currently saving
  filter   = signal('');                    // free-text over label + raw key

  readonly sectionLabelKey = sectionLabelKey;

  /**
   * Sections narrowed by the free-text filter, matching SUMMARY, PATH or RAW KEY.
   *
   * ⚠️ A FILTER IS MANDATORY HERE, NOT A CONVENIENCE — 357 rows across 39 sections. Copied from
   * the users-details `sysFnFilter` / `filteredSysFnRows` pair so the two admin surfaces behave
   * identically.
   *
   * ⚠️ Sections with no surviving row are DROPPED rather than rendered empty: an empty card
   * under a heading reads as "this section has no endpoints", which is a different and false
   * statement from "nothing here matched your filter".
   */
  filteredSections = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const all = this.sections();
    if (!q) return all;
    return all
      .map(s => ({
        section: s.section,
        license: s.license,
        items: s.items.filter(i =>
          (i.summary || '').toLowerCase().includes(q) ||
          i.path.toLowerCase().includes(q) ||
          i.key.toLowerCase().includes(q)),
      }))
      .filter(s => s.items.length > 0);
  });

  totalCount    = computed(() => this.sections().reduce((n, s) => n + s.items.length, 0));
  disabledCount = computed(() =>
    this.sections().reduce((n, s) => n + s.items.filter(i => !i.enabled).length, 0));

  ngOnInit() {}

  async ionViewDidEnter() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      // ⚠️ REGISTRY ORDER IS SERVER ORDER — do NOT sort or re-group here. The registry is
      // generated from the API spec's own domain tags and is the REVIEWED order; re-sorting a
      // 357-row list a human is expected to scan would quietly discard that review.
      const res = await this.apiService.vaultApiEndpointsList();
      this.sections.set(res?.sections ?? []);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Per-toggle immediate save behind a confirm — no dirty buffer, no Save button, matching the
   * menu page. The confirm text names the DIRECTION, because "are you sure?" over a 357-row list
   * is not a question anyone can answer.
   */
  async toggle(item: ApiEndpointItem, enabled: boolean) {
    const okToGo = await this.alertService.show(
      this.translate.instant(enabled
        ? 'settings.apiEndpoints.confirmEnableTitle'
        : 'settings.apiEndpoints.confirmDisableTitle'),
      this.translate.instant(enabled
        ? 'settings.apiEndpoints.confirmEnableMsg'
        : 'settings.apiEndpoints.confirmDisableMsg', { name: item.summary || item.key }),
      this.translate.instant('common.confirm'));
    if (!okToGo) {
      // Re-render from state so the checkbox springs back — the DOM already moved.
      this.sections.set([...this.sections()]);
      return;
    }

    this.saving.set(item.key);
    try {
      const res = await this.apiService.vaultApiEndpointSet(item.key, enabled);
      if (res?.error) {
        // ⚠️ `show`, not `info` — the Vault's AlertService exposes only `show`. (The Regulator
        // Dashboard has `info`; the two apps' alert services are NOT the same surface.)
        await this.alertService.info(this.translate.instant('alerts.error'), res.error);
        this.sections.set([...this.sections()]);
        return;
      }
      item.enabled = enabled;
      item.overridden = true;
      this.sections.set([...this.sections()]);
    } finally {
      this.saving.set(null);
    }
  }

  /**
   * Clear the override, returning the endpoint to its registry default.
   *
   * ⚠️ This is NOT "enable" — it removes the DECISION. A row means an admin chose; resetting
   * deletes that record rather than replacing it with a choice nobody made. The button only
   * appears on overridden rows, so a reader can see at a glance which switches were touched.
   */
  async reset(item: ApiEndpointItem) {
    const okToGo = await this.alertService.show(
      this.translate.instant('settings.apiEndpoints.confirmResetTitle'),
      this.translate.instant('settings.apiEndpoints.confirmResetMsg', { name: item.summary || item.key }),
      this.translate.instant('common.confirm'));
    if (!okToGo) return;

    this.saving.set(item.key);
    try {
      const res = await this.apiService.vaultApiEndpointReset(item.key);
      if (res?.error) {
        await this.alertService.info(this.translate.instant('alerts.error'), res.error);
        return;
      }
      // Re-load rather than guessing the default: the registry default is the server's to state,
      // and assuming `true` here would be this page inventing the very value it is meant to read.
      await this.load();
    } finally {
      this.saving.set(null);
    }
  }
}
