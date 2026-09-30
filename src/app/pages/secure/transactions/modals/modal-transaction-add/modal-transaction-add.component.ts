import { Component, ChangeDetectionStrategy, inject, signal, effect, computed } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalTransactionAddService, AddTransactionData } from './modal-transaction-add.service';
import { ApiService } from '../../../../../shared/services/api.service';

// A token issuer is a service HOLDING licence class 27 — Phase 28 retired `serviceType`, so
// there is no byte that says so. Named once here, matching `modal-asset-add.component.ts`
// rather than inventing a second spelling of the same fact.
const CLASS_TOKEN_ISSUER = 27;
// A DISTRIBUTOR sells other issuers' funds on the primary market — the Brokerage licence (29). Its assets come from
// its accepted distribution agreements, never from `GET /assets`, which is the issuance section and licence-gated
// to 27 (user report 2026-09-30: Telda — a distributor only — saw no service here at all).
const CLASS_BROKERAGE = 29;

@Component({
  selector: 'app-modal-transaction-add',
  templateUrl: './modal-transaction-add.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
})
export class ModalTransactionAddComponent {
  modalService = inject(ModalTransactionAddService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  services = signal<{ address: string; name: string; issuer: boolean }[]>([]);
  assets = signal<{ address: string; name: string; symbol: string }[]>([]);
  subscriptions = signal<{ address: string; service: string }[]>([]);

  form = this.fb.group({
    trxType: ['Subscribe' as 'Subscribe' | 'Redeem', Validators.required],
    service: ['', Validators.required],
    asset: ['', Validators.required],
    subscription: ['', Validators.required],
    tokens: [null as number | null, [Validators.required, Validators.min(1)]],
  });

  selectedService = signal<string>('');

  filteredAssets = computed(() => {
    const svc = this.selectedService();
    if (!svc) return [];
    return this.assets();
  });

  filteredSubscriptions = computed(() => {
    const svc = this.selectedService();
    if (!svc) return [];
    return this.subscriptions().filter(s => (s.service || '').toLowerCase() === svc.toLowerCase());
  });

  constructor() {
    effect(() => {
      if (this.modalService.isVisible()) {
        this.form.reset({ trxType: 'Subscribe', service: '', asset: '', subscription: '', tokens: null });
        this.selectedService.set('');
        this.assets.set([]);
        this.loadServices();
        this.loadSubscriptions();
      }
    });

    this.form.get('service')!.valueChanges.subscribe(async (value) => {
      const svc = value || '';
      this.selectedService.set(svc);
      this.form.patchValue({ asset: '', subscription: '' }, { emitEvent: false });
      this.assets.set([]);
      if (svc) await this.loadAssetsForService(svc);
    });
  }

  async loadServices() {
    const data = await this.apiService.vaultGetServicesOwn(0, 100);
    if (data?.services) {
      this.services.set(
        data.services
          // ⚠️ WAS `s.service_type === 1` — RETIRED BY PHASE 28, so this read `undefined === 1`,
          // was permanently false, and the service list came back EMPTY. The user reported it as
          // "Add Transaction shows no assets", because the asset list only loads once a service
          // is picked: the visible symptom was two steps downstream of the dead field, and it
          // looked like missing DATA rather than a broken filter. Nothing threw, at any point.
          //
          // `license_class_ids` is the ACTIVE licence set from the Entity API's `getServices`,
          // so a suspended licence correctly drops the service out of the list.
          .filter((s: any) => ((s.license_class_ids ?? []).includes(CLASS_TOKEN_ISSUER)
                            || (s.license_class_ids ?? []).includes(CLASS_BROKERAGE))
                           && (s.state === 2 || s.state === '2'))
          .map((s: any) => ({ address: s.address, name: s.name,
                              issuer: (s.license_class_ids ?? []).includes(CLASS_TOKEN_ISSUER) }))
      );
    }
  }

  /** The assets this service may sell: its OWN issued assets (token issuers only — `GET /assets` is gated to 27) plus
   *  the funds it DISTRIBUTES under an accepted, regulator-activated agreement. */
  async loadAssetsForService(service: string) {
    const svc = service.toLowerCase();
    const isIssuer = this.services().find(s => s.address.toLowerCase() === svc)?.issuer ?? false;
    const [own, agreements] = await Promise.all([
      isIssuer ? this.apiService.vaultGetAssets(0, 200, service) : Promise.resolve(null),
      this.apiService.vaultDistributionInbound().catch(() => []),
    ]);
    const out = new Map<string, { address: string; name: string; symbol: string }>();
    for (const a of own?.assets ?? []) out.set(String(a.address).toLowerCase(), { address: a.address, name: a.name, symbol: a.symbol });
    for (const g of agreements ?? []) {
      if (String(g.service).toLowerCase() !== svc || Number(g.state) !== 2 || !g.distributionAccepted) continue;
      out.set(String(g.asset).toLowerCase(), { address: g.asset, name: g.assetName ?? g.asset, symbol: g.assetSymbol ?? "" });
    }
    if (this.selectedService().toLowerCase() === svc) this.assets.set([...out.values()]);
  }

  async loadSubscriptions() {
    const data = await this.apiService.vaultGetSubscriptions(undefined, 0, 1000);
    if (data?.subscriptions) {
      this.subscriptions.set(
        data.subscriptions
          .filter((s: any) => (s.state === 2 || s.state === '2') && !s.suspended)
          .map((s: any) => ({ address: s.address, service: s.service ?? '' }))
      );
    }
  }

  onSave(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const data: AddTransactionData = {
      trxType: v.trxType ?? 'Subscribe',
      service: v.service ?? '',
      asset: v.asset ?? '',
      subscription: v.subscription ?? '',
      tokens: Number(v.tokens),
    };
    this.modalService.confirm(data);
  }

  onCancel(): void {
    this.modalService.cancel();
  }
}
