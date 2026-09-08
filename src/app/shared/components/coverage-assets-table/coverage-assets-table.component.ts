import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
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
 * (TOKENS, plain integer) · Bid · Gross · Contribution (both MONEY, `| money`).
 *
 *   λ cell:  amber "Not set" when `!lambdaSet`; amber "invalid — treated as not set" when
 *            `lambdaInvalid`; otherwise the coefficient as a percentage (2 dp).
 *   Contribution: `| money`, or "—" when λ is unset — it is NULL, not zero, and printing 0
 *            would read as "this asset owes nothing", which is the exact claim nobody made.
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
export class CoverageAssetsTableComponent {
  @Input() assets: CoverageAssetRow[] = [];
  @Input() unsetCount = 0;

  private apiService = inject(ApiService);
  private classNames = signal<Record<number, string>>({});

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

  /** The catalog name, or the bare id when the catalog has not loaded / lacks it. */
  className(id: number | null | undefined): string {
    const n = Number(id);
    if (!n) return '—';
    return this.classNames()[n] ?? `Class ${n}`;
  }
}
