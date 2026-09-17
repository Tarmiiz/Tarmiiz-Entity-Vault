import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

import { MoneyPipe } from '../../pipes/money.pipe';
import { ApiService } from '../../services/api.service';
import { CoverageAssetRow } from '../../models/data.model';

/**
 * The per-asset decomposition of a service's redemption obligation (Phase 31 — λ).
 *
 * ONE table for the three Vault coverage surfaces (dashboard card, services list, service
 * detail Liquidity tab), rendered inside a row expander. It shows HOW the obligation figure
 * was reached — asset by asset — so a "not assessed" row names the asset whose λ is missing
 * rather than leaving the operator to guess.
 *
 * Columns: Asset · Symbol (own column — Standard 6) · Class · Formula · λ · Outstanding
 * (TOKENS, plain integer) · Bid · Gross · Contribution (both MONEY, `| money`) · Deployed (net).
 *
 *   λ cell:  amber "Not set" when `!lambdaSet`; amber "invalid — treated as not set" when
 *            `lambdaInvalid`; otherwise the coefficient as a percentage (2 dp).
 *   Contribution: `| money`, or "—" when λ is unset — it is NULL, not zero, and printing 0
 *            would read as "this asset owes nothing", which is the exact claim nobody made.
 *   Deployed (net) — 33.G G.6: `realisations − deployments` per asset from the S111 flow
 *            identity (`GET /services/:address/flow-identity`, the Entity twin), computed HERE
 *            rather than served as a field so the two dashboards cannot drift on the sign.
 *            Origins 15 / 16 do not exist on chain yet, so it reads 0.00 today by construction;
 *            "—" only when the identity could not be read or no service / currency was given.
 *
 * Footer: "not assessed — N asset(s) without a redemption coefficient" when `unsetCount > 0`.
 *
 * The coverage row carries only the class ID, so the class NAME is resolved from the on-chain
 * `Asset Class` Global Variables category (the Add Asset modal's precedent) — never from a
 * local map, which would be a second copy of an append-only catalog. One fetch is shared by
 * every instance on the page via the module-level memo below.
 */
let _classNamesPromise: Promise<Record<number, string>> | null = null;

@Component({
  selector: 'app-coverage-assets-table',
  templateUrl: './coverage-assets-table.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, TranslatePipe, MoneyPipe],
})
export class CoverageAssetsTableComponent implements OnChanges {
  @Input() assets: CoverageAssetRow[] = [];
  @Input() unsetCount = 0;
  /** The (service, currency) the rows belong to — what the flow identity is read for. */
  @Input() service: string | null | undefined;
  @Input() currencyCode: number | null | undefined;

  private apiService = inject(ApiService);
  private classNames = signal<Record<number, string>>({});
  /** asset (lower-case) → realisations − deployments; null while unread / unreadable. */
  deployedNet = signal<Record<string, number> | null>(null);

  constructor() {
    if (!_classNamesPromise) {
      _classNamesPromise = this.apiService.vaultGetGlobalVariablesByCategory('Asset Class')
        .then((list: any[] | null) => {
          const out: Record<number, string> = {};
          for (const v of (list ?? [])) {
            const id = Number(v.variableId ?? v.variable_id);
            if (id > 0 && v.name) out[id] = String(v.name);
          }
          return out;
        })
        .catch(() => ({} as Record<number, string>));
    }
    _classNamesPromise.then((m) => this.classNames.set(m));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['service'] || changes['currencyCode']) this.loadDeployedNet();
  }

  private async loadDeployedNet(): Promise<void> {
    this.deployedNet.set(null);
    if (!this.service || !(Number(this.currencyCode) > 0)) return;
    try {
      const r = await this.apiService.serviceFlowIdentity(this.service, Number(this.currencyCode));
      const list: any[] = r?.identity?.assets ?? [];
      const out: Record<string, number> = {};
      for (const a of list) out[String(a.asset).toLowerCase()] = (Number(a.realisations) || 0) - (Number(a.deployments) || 0);
      this.deployedNet.set(out);
    } catch {
      this.deployedNet.set(null);
    }
  }

  /** The net figure for one asset row, or null when the identity could not be read. */
  deployedNetOf(asset: string): number | null {
    const m = this.deployedNet();
    if (!m) return null;
    return m[String(asset).toLowerCase()] ?? 0;
  }

  /** The catalog name, or the bare id when the catalog has not loaded / lacks it. */
  className(id: number | null | undefined): string {
    const n = Number(id);
    if (!n) return '—';
    return this.classNames()[n] ?? `Class ${n}`;
  }
}
