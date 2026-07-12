import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import {
  ExternalIntegration,
  IntegrationConsumer,
  IntegrationServiceCandidate,
} from '../../../../shared/models/data.model';

const CATEGORY_SUGGESTIONS = ['ekyc', 'payments', 'banking', 'custody', 'data', 'messaging', 'other'];
const SLUG = /^[a-z0-9_-]{2,32}$/;

@Component({
  selector: 'app-settings-external-integrations',
  templateUrl: './external-integrations.page.html',
  styleUrls: ['./external-integrations.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
})
export class ExternalIntegrationsPage implements OnInit {
  private apiService     = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);

  integrations = signal<ExternalIntegration[]>([]);
  loading      = signal(false);
  busy         = signal(false);

  categorySuggestions = CATEGORY_SUGGESTIONS;

  // Adapter options for the create form = every registry adapter surfaced by the list.
  adapters = computed(() => {
    const names = new Set<string>();
    for (const i of this.integrations()) if (i.adapter) names.add(i.adapter);
    return [...names].sort();
  });

  // Edit / create modal state — param inputs are write-only: empty leaves the stored value.
  editVisible     = signal(false);
  createMode      = signal(false);
  editing         = signal<ExternalIntegration | null>(null);
  editName        = signal('');
  editDisplayName = signal('');
  editCategory    = signal('other');
  editAdapter     = signal('');
  editEnabled     = signal(false);
  editDefault     = signal(false);
  paramValues     = signal<Record<string, string>>({});
  removedKeys     = signal<string[]>([]);
  newParams       = signal<{ key: string; value: string; secret: boolean }[]>([]);

  // Link-services modal state.
  linkVisible   = signal(false);
  linkTarget    = signal<ExternalIntegration | null>(null);
  candidates    = signal<IntegrationServiceCandidate[]>([]);
  selectedLinks = signal<Record<string, boolean>>({});
  consumers     = signal<IntegrationConsumer[]>([]);
  linkFilter    = signal('');

  filteredCandidates = computed(() => {
    const q = this.linkFilter().trim().toLowerCase();
    if (!q) return this.candidates();
    return this.candidates().filter(c =>
      (c.name || '').toLowerCase().includes(q) || c.address.toLowerCase().includes(q));
  });

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

  capabilitiesLabel(p: ExternalIntegration): string {
    if (!p.capabilities) return '—';
    return 'Verify'
      + (p.capabilities.transactionInquiry ? ', Inquiry' : '')
      + (p.capabilities.fetchImages ? ', Images' : '');
  }

  // ─── Create / edit modal ────────────────────────────────────────────────────

  openCreate() {
    this.createMode.set(true);
    this.editing.set(null);
    this.editName.set('');
    this.editDisplayName.set('');
    this.editCategory.set('other');
    this.editAdapter.set('');
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
    this.editAdapter.set(p.adapter || '');
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
      if (!SLUG.test(name)) { this.alertService.show('Invalid Name', 'Name must be a 2-32 character slug (a-z, 0-9, -, _).'); return; }
      if (!SLUG.test(category)) { this.alertService.show('Invalid Category', 'Category must be a 2-32 character slug (a-z, 0-9, -, _).'); return; }
      this.busy.set(true);
      this.loadingService.show('Creating integration...');
      try {
        const res = await this.apiService.vaultIntegrationCreate({
          name,
          displayName: this.editDisplayName() || name,
          category,
          ...(category === 'ekyc' && this.editAdapter() ? { adapter: this.editAdapter() } : {}),
          enabled:   this.editEnabled(),
          isDefault: this.editDefault(),
          ...(Object.keys(params).length ? { params } : {}),
        });
        if (res?.error) { this.alertService.show('Create Failed', res.error); return; }
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
    this.loadingService.show('Saving integration...');
    try {
      const res = await this.apiService.vaultIntegrationUpdate(p.name, {
        displayName: this.editDisplayName(),
        enabled:     this.editEnabled(),
        isDefault:   this.editDefault(),
        ...(Object.keys(params).length ? { params } : {}),
      });
      if (res?.error) { this.alertService.show('Save Failed', res.error); return; }
      this.closeEdit();
      await this.load();
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }

  // ─── Row actions ────────────────────────────────────────────────────────────

  async test(p: ExternalIntegration) {
    if (this.busy()) return;
    this.busy.set(true);
    this.loadingService.show('Testing connection...');
    try {
      const res = await this.apiService.vaultIntegrationTest(p.name);
      if (res.connected) {
        this.alertService.show('Connection OK', `${p.displayName} responded successfully — the stored parameters are valid.`);
      } else {
        this.alertService.show('Connection Failed', res.error || 'The provider did not accept the stored parameters.');
      }
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }

  async makeDefault(p: ExternalIntegration) {
    if (this.busy() || p.isDefault) return;
    const ok = await this.alertService.show(
      'Change default integration',
      `${p.displayName} becomes the default for the '${p.category}' category. Continue?`,
      'Set Default',
    );
    if (!ok) return;
    this.busy.set(true);
    this.loadingService.show('Updating...');
    try {
      const res = await this.apiService.vaultIntegrationUpdate(p.name, { isDefault: true });
      if (res?.error) this.alertService.show('Update Failed', res.error);
      await this.load();
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }

  async toggleEnabled(p: ExternalIntegration) {
    if (this.busy()) return;
    const verb = p.enabled ? 'Disable' : 'Enable';
    const consequence = p.enabled
      ? (p.isDefault && p.category === 'ekyc'
          ? 'This is the DEFAULT eKYC provider — legacy provider inquiries will fail until another provider is made default.'
          : 'Consumers referencing this integration will fail.')
      : 'It becomes usable again.';
    const ok = await this.alertService.show(
      `${verb} integration`,
      `${verb} ${p.displayName}? ${consequence}`,
      verb,
    );
    if (!ok) return;
    this.busy.set(true);
    this.loadingService.show('Updating...');
    try {
      const res = await this.apiService.vaultIntegrationUpdate(p.name, { enabled: !p.enabled });
      if (res?.error) this.alertService.show('Update Failed', res.error);
      await this.load();
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }

  async remove(p: ExternalIntegration) {
    if (this.busy()) return;
    const ok = await this.alertService.show(
      'Delete integration',
      `Delete ${p.displayName} and its stored parameters? This cannot be undone.`,
      'Delete',
    );
    if (!ok) return;
    this.busy.set(true);
    this.loadingService.show('Deleting...');
    try {
      const res = await this.apiService.vaultIntegrationDelete(p.name);
      if (res?.error) { this.alertService.show('Delete Failed', res.error); return; }
      await this.load();
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }

  // ─── Link-services modal ────────────────────────────────────────────────────

  async openLinks(p: ExternalIntegration) {
    if (this.busy()) return;
    this.linkTarget.set(p);
    this.linkFilter.set('');
    this.loadingService.show('Loading services...');
    try {
      const [candidates, linkData] = await Promise.all([
        this.apiService.vaultIntegrationServiceCandidates(),
        this.apiService.vaultIntegrationLinks(p.name),
      ]);
      this.candidates.set(candidates);
      const selected: Record<string, boolean> = {};
      for (const l of linkData.links) selected[l.service.toLowerCase()] = true;
      this.selectedLinks.set(selected);
      this.consumers.set(linkData.consumers);
      this.linkVisible.set(true);
    } finally {
      this.loadingService.hide();
    }
  }

  isLinked(address: string): boolean {
    return !!this.selectedLinks()[address.toLowerCase()];
  }

  toggleLink(address: string) {
    const key = address.toLowerCase();
    this.selectedLinks.set({ ...this.selectedLinks(), [key]: !this.selectedLinks()[key] });
  }

  selectedLinkCount(): number {
    return Object.values(this.selectedLinks()).filter(Boolean).length;
  }

  closeLinks() {
    this.linkVisible.set(false);
    this.linkTarget.set(null);
    this.consumers.set([]);
  }

  async saveLinks() {
    const p = this.linkTarget();
    if (!p || this.busy()) return;
    const services = Object.entries(this.selectedLinks()).filter(([, v]) => v).map(([k]) => k);
    this.busy.set(true);
    this.loadingService.show('Saving links...');
    try {
      const res = await this.apiService.vaultIntegrationLinksSet(p.name, services);
      if (res?.error) { this.alertService.show('Save Failed', res.error); return; }
      this.closeLinks();
      await this.load();
    } finally {
      this.loadingService.hide();
      this.busy.set(false);
    }
  }

  partyTypeLabel(t: number): string {
    return t === 1 ? 'Validator' : t === 2 ? 'Payment Processor' : t === 3 ? 'Custodian' : 'Provider';
  }
}
