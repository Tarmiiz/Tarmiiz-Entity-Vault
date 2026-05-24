import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';

import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';

import { ApprovalPolicyRow, approvalPolicyFromApi } from '../../../../shared/models/data.model';

// Entity-side action categories. Narrower than the Regulator API set —
// no validator / PP / entity-self / service-suspended / asset-suspended,
// since the entity does not perform those actions on its own things.
const CATEGORY_LABELS: Record<string, string> = {
  service_state:       'Service: state change',
  subscription_state:  'Subscription: state change',
  asset_state:         'Asset: state change',
  asset_service_state: 'Asset-service: per-service state',
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

  rows    = signal<ApprovalPolicyRow[]>([]);
  loading = signal(false);
  saving  = signal<string | null>(null);

  labelFor(cat: string): string { return CATEGORY_LABELS[cat] || cat; }

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
    const verb = requiresApproval ? 'require maker/checker approval' : 'stop requiring approval (revert to direct execute)';
    const ok = await this.alertService.show('Confirm policy change', `${this.labelFor(row.actionCategory)} will now ${verb} on this entity. Continue?`, 'Save');
    if (!ok) return;
    this.saving.set(row.actionCategory);
    try {
      const res = await this.apiService.vaultApprovalsPolicySet(row.actionCategory, requiresApproval);
      if (res?.error) {
        this.alertService.show('Error', res.error);
      } else {
        await this.load();
      }
    } finally {
      this.saving.set(null);
    }
  }
}
