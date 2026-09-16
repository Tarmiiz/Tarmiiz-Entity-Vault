import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';

import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';

import { ApprovalPolicyRow, approvalPolicyFromApi } from '../../../../shared/models/data.model';
import { LicensePillComponent } from '../../../../shared/components/license-pill/license-pill.component';
import { SubTabRailComponent } from '../../../../shared/components/sub-tab-rail/sub-tab-rail.component';
import { TabDef } from '../../../../shared/components/tabs/tabs.component';
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';
import {
  approvalCategoryGroupFor,
  approvalCategoryGroupLabelFor,
  approvalCategoryNameFor,
  approvalCategoryDescriptionFor,
} from '../../../../shared/constants/approval-category-meta';

@Component({
  selector: 'app-approvals-policy',
  templateUrl: './policy.page.html',
  styleUrls: ['./policy.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, TranslatePipe, HeaderComponent,
    LicensePillComponent, SubTabRailComponent, LoadingStateComponent,
  ],
})
export class PolicyPage implements OnInit {
  private apiService     = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);

  rows    = signal<ApprovalPolicyRow[]>([]);
  loading = signal(false);
  saving  = signal<string | null>(null);
  group   = signal<string | null>(null);

  nameFor(cat: string): string { return this.translate.instant(approvalCategoryNameFor(cat)); }
  descFor(cat: string): string { return this.translate.instant(approvalCategoryDescriptionFor(cat)); }

  /**
   * Rows the tenant can actually raise a request in.
   *
   * ⚠️ ONLY `not-covered` is hidden. `undetermined` means the licence set could
   * not be READ — chase the chain or the sync, not the regulator — and rendering
   * that as "you are not licensed" states something we do not know. Same rule as
   * `FeaturesService.menuEnabled`, and the reason the two states are separate
   * values rather than one boolean.
   *
   * A policy row for a closed category is not wrong, it is INERT: nothing can
   * raise a request in it, so the toggle governs nothing. Showing it invites an
   * admin to switch on a queue that will always be empty.
   */
  visibleRows = computed(() =>
    this.rows().filter((r) => r.license?.state !== 'not-covered'));

  /** One rail item per domain that has at least one visible row, with its count. */
  groups = computed<TabDef[]>(() => {
    const counts = new Map<string, number>();
    for (const r of this.visibleRows()) {
      const g = approvalCategoryGroupFor(r.actionCategory);
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ key, label: approvalCategoryGroupLabelFor(key), count }));
  });

  /**
   * The selected group, falling back to the first rail item — a stored selection
   * whose group has gone (a licence closed, the last row hidden) must not leave
   * the pane empty with a rail that shows nothing selected.
   */
  activeGroup = computed(() => {
    const gs = this.groups();
    const sel = this.group();
    return sel && gs.some((g) => g.key === sel) ? sel : (gs[0]?.key ?? null);
  });

  rowsInGroup = computed(() => {
    const g = this.activeGroup();
    return this.visibleRows()
      .filter((r) => approvalCategoryGroupFor(r.actionCategory) === g)
      .sort((a, b) => this.nameFor(a.actionCategory).localeCompare(this.nameFor(b.actionCategory)));
  });

  ngOnInit() {}

  async ionViewDidEnter() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const res = await this.apiService.vaultApprovalsPolicyList();
      const rows = (res?.policy ?? []).map(approvalPolicyFromApi);
      rows.sort((a: ApprovalPolicyRow, b: ApprovalPolicyRow) => a.actionCategory.localeCompare(b.actionCategory));
      this.rows.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  async toggle(row: ApprovalPolicyRow, requiresApproval: boolean) {
    if (this.saving()) return;
    const verb = requiresApproval
      ? this.translate.instant('approvals.policy.verbRequire')
      : this.translate.instant('approvals.policy.verbDirectExecute');
    const message = this.translate.instant('approvals.policy.confirmMessage', { label: this.nameFor(row.actionCategory), verb });
    const ok = await this.alertService.show(this.translate.instant('approvals.policy.confirmTitle'), message, this.translate.instant('common.save'));
    if (!ok) return;
    this.saving.set(row.actionCategory);
    try {
      const res = await this.apiService.vaultApprovalsPolicySet(row.actionCategory, requiresApproval);
      if (res?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.load();
      }
    } finally {
      this.saving.set(null);
    }
  }
}
