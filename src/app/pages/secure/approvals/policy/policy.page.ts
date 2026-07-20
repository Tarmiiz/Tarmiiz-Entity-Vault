import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';

import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';

import { ApprovalPolicyRow, approvalPolicyFromApi } from '../../../../shared/models/data.model';

// Entity-side action categories. Narrower than the Regulator API set —
// no validator / PP / entity-self / service-suspended / asset-suspended,
// since the entity does not perform those actions on its own things.
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  service_state:       'approvals.policy.categories.serviceState',
  subscription_state:  'approvals.policy.categories.subscriptionState',
  asset_state:         'approvals.policy.categories.assetState',
  asset_service_state: 'approvals.policy.categories.assetServiceState',
  entity_sp_add:       'approvals.policy.categories.entitySpAdd',
  entity_sp_state:     'approvals.policy.categories.entitySpState',
};

@Component({
  selector: 'app-approvals-policy',
  templateUrl: './policy.page.html',
  styleUrls: ['./policy.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, HeaderComponent],
})
export class PolicyPage implements OnInit {
  private apiService     = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);

  rows    = signal<ApprovalPolicyRow[]>([]);
  loading = signal(false);
  saving  = signal<string | null>(null);

  labelFor(cat: string): string {
    const key = CATEGORY_LABEL_KEYS[cat];
    return key ? this.translate.instant(key) : cat;
  }

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
    const message = this.translate.instant('approvals.policy.confirmMessage', { label: this.labelFor(row.actionCategory), verb });
    const ok = await this.alertService.show(this.translate.instant('approvals.policy.confirmTitle'), message, this.translate.instant('common.save'));
    if (!ok) return;
    this.saving.set(row.actionCategory);
    try {
      const res = await this.apiService.vaultApprovalsPolicySet(row.actionCategory, requiresApproval);
      if (res?.error) {
        this.alertService.show(this.translate.instant('alerts.error'), res.error);
      } else {
        await this.load();
      }
    } finally {
      this.saving.set(null);
    }
  }
}
