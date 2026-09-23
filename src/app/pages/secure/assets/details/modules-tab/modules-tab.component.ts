import { Component, ChangeDetectionStrategy, Input, OnChanges, SimpleChanges, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ApiService } from '../../../../../shared/services/api.service';
import { AuthService } from '../../../../../shared/services/auth.service';
import { FeaturesService } from '../../../../../shared/services/features.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { RefreshButtonComponent } from '../../../../../shared/components/refresh-button/refresh-button.component';

/*
    THE ASSET'S MODULES TAB (2026-09-23) — which capability modules this asset's PRODUCT requires or
    permits, which are attached, and the attach / detach actions for them.

    Before this, the Entity API's attach / detach / register routes existed with nothing to call
    them and nothing to read, so an asset registered with no modules at all (Granite EGP Fund on
    base: no service registry, so its issuing service read state "Unknown") looked like any other.

    Three gates stand between a module and an asset, and only the last is the issuer's:
      1. the JURISDICTION approves the version (Regulator Dashboard → Module Approvals);
      2. the PRODUCT names it — Required or Permitted (Asset Class Builder → Modules); a module the
         product does not name is refused at attach, so it is not listed here unless attached;
      3. the ISSUER attaches it (this tab). A Required module is normally attached at creation; one
         added to the product AFTER the asset was issued shows here as missing and is attached from
         here. An attach of an unapproved version is refused by the chain, and that reason is shown
         verbatim rather than second-guessed.
    Detach is offered only for a module the product does not require — the core refuses the rest.
*/

interface AssetModuleRow {
  moduleId: string;
  name: string;
  policy: number;            // 0 not named (listed only when attached) | 1 permitted | 2 required
  minVersion: number;
  attached: boolean;
  attachedAddress: string | null;
  attachedVersion: number | null;
  latestVersion: number | null;
}

@Component({
  selector: 'app-asset-modules-tab',
  templateUrl: './modules-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TranslatePipe, RefreshButtonComponent],
})
export class ModulesTabComponent implements OnChanges {

  @Input() address = '';
  @Input() entityActive = true;
  /** The parent already resolves this from the asset — do not re-derive it here. */
  @Input() canManage = false;

  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private translate = inject(TranslateService);
  features = inject(FeaturesService);

  formula = signal<string | null>(null);
  modules = signal<AssetModuleRow[]>([]);
  loading = signal(false);
  loadFailed = signal(false);

  missingRequired = computed(() => this.modules().filter((m) => m.policy === 2 && !m.attached));

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['address'] && this.address) this.load();
  }

  /** Same gates as the API route: not a viewer, the asset's manager, entity active, `asset-edit-metadata`. */
  canAct(): boolean {
    const role = this.authService.userInfo?.role;
    return !!role && role !== 3 && this.canManage && this.entityActive
      && this.features.systemFunctionEnabled('asset-edit-metadata');
  }
  canAttach = (m: AssetModuleRow) => this.canAct() && !m.attached && m.policy > 0;
  canDetach = (m: AssetModuleRow) => this.canAct() && m.attached && m.policy !== 2;

  label = (m: AssetModuleRow) => m.name || (m.moduleId.slice(0, 10) + '…' + m.moduleId.slice(-6));
  policyKey(p: number): string {
    return p === 2 ? 'assets.details.modules.policyRequired'
         : p === 1 ? 'assets.details.modules.policyPermitted'
         : 'assets.details.modules.policyNotNamed';
  }
  policyClass(p: number): string {
    return p === 2 ? 'bg-blue-100 text-blue-800' : p === 1 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600';
  }
  statusKey(m: AssetModuleRow): string {
    if (m.attached) return 'assets.details.modules.statusAttached';
    return m.policy === 2 ? 'assets.details.modules.statusMissing' : 'assets.details.modules.statusAvailable';
  }
  statusClass(m: AssetModuleRow): string {
    if (m.attached) return 'bg-green-100 text-green-800';
    return m.policy === 2 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600';
  }

  async load() {
    if (!this.address) return;
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const res: any = await this.apiService.vaultGetAssetModules(this.address);
      if (!res) { this.loadFailed.set(true); this.modules.set([]); return; }
      this.formula.set(res.formula || null);
      // Required first, then permitted, then anything attached the product no longer names.
      const rows: AssetModuleRow[] = (res.modules || []).slice()
        .sort((a: AssetModuleRow, b: AssetModuleRow) => (b.policy - a.policy) || this.label(a).localeCompare(this.label(b)));
      this.modules.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  async attach(m: AssetModuleRow) {
    const ok = await this.alertService.show(
      this.translate.instant('assets.details.modules.attachTitle'),
      this.translate.instant('assets.details.modules.attachConfirm', { name: this.label(m), version: m.latestVersion ?? '?' }));
    if (!ok) return;
    await this.write(() => this.apiService.vaultAttachAssetModule(this.address, m.moduleId), 'assets.details.modules.attachFailed');
  }

  async detach(m: AssetModuleRow) {
    const ok = await this.alertService.show(
      this.translate.instant('assets.details.modules.detachTitle'),
      this.translate.instant('assets.details.modules.detachConfirm', { name: this.label(m) }));
    if (!ok) return;
    await this.write(() => this.apiService.vaultDetachAssetModule(this.address, m.moduleId), 'assets.details.modules.detachFailed');
  }

  /** Hide the loader BEFORE any alert raised inside it — the alert awaits its OK button, which the
   *  overlay would otherwise sit on top of (the platform's loader/alert deadlock). */
  private async write(fn: () => Promise<any>, failKey: string) {
    this.loadingService.show();
    try {
      const res: any = await fn();
      if (!res || res.error) {
        this.loadingService.hide();
        await this.alertService.info(this.translate.instant(failKey), res?.error || this.translate.instant('alerts.unexpected'));
        return;
      }
      await this.load();
    } finally {
      this.loadingService.hide();
    }
  }
}
