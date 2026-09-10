import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { SessionService } from './session.service';
import { SocketService } from './socket.service';
import { PARTY_CLASS } from '../constants/party-class';

/*
  ⚠️ ENTITY MODE IS RETIRED (2026-09-10, Phase 28 ruling 7 / item 28.13).

  The tenant no longer picks its own surface from a "mode" dropdown. Two SERVER-resolved layers,
  both set by the tenant's REGULATOR, decide what exists:
    · LICENCES — `features.licenses.menu[key].state`; only `not-covered` hides a module.
    · GRANTS   — already folded into the served `menu` / `systemFunctions` maps (Phase 17 A2a),
                 so they need no predicate here.
  The admin's menu toggle still restricts WITHIN that ceiling.

  The dashboard variant, which used to key off the mode, is DERIVED from the licences held — the
  same derivation the Regulator Dashboard already uses for an entity's details page.
*/

@Injectable({ providedIn: 'root' })
export class FeaturesService {
  private apiService = inject(ApiService);
  private session = inject(SessionService);
  private socketService = inject(SocketService);

  // env-level DEX kill switch, kept separate from the admin menu toggle.
  private envDex = signal(false);
  loaded = signal(false);

  // Per-tenant admin menu toggles { key: enabled }, with the regulator's grant ceiling already
  // folded in server-side. Absent key ⇒ treated as enabled, so core/unknown items never disappear.
  menu = signal<Record<string, boolean>>({});

  // Decimal places every MONEY value renders with — SERVER-owned (Entity API app_config
  // CURRENCY_DECIMALS, edited from the admin System Configuration page). Read by MoneyPipe
  // and UtilsService.formatPrice/roundMoney, so it governs the screen, the PDF exports and
  // the rounding applied to Excel cells alike. Seeded with the registry default so the
  // first paint (before /features lands) matches the shipped look.
  currencyDecimals = signal(6);

  // Per-user System Functions map { key: enabled } (action-button gating), grant ceiling folded
  // in. Populated only once authenticated (from /features/me); absent key ⇒ enabled.
  systemFunctions = signal<Record<string, boolean>>({});

  // The tenant's REGULATOR-ISSUED LICENCES, as the API folds them per menu key (2026-09-10).
  // `menu[key].state`: 'available' | 'not-covered' | 'undetermined' | 'core' | 'unknown'.
  // SERVER-owned: the Vault never derives licence coverage itself.
  licenses = signal<{ determined: boolean; held: number[]; menu: Record<string, { state: string; sections: string[]; covered: number; total: number; note: string }> } | null>(null);

  private inflight: Promise<void> | null = null;
  private grantRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Eagerly fetch on first injection so menu/route guards have an answer ASAP.
    this.refresh();

    /*
      A regulator's GRANT change is made in ANOTHER tenant and reaches this one only through the
      sync plugin (`party_grants:<block>`), so no local action exists to hang a refresh off — without
      this a revocation would never reach a live session (the gap the Phase 17 amendment names).
      Trailing-debounced: the server emits one event per mirrored cell, so a batch grant arrives as
      a burst (the unread-messages storm lesson — one refresh per burst, never one per event).
    */
    // `licenses` rides the same path: an approval or a suspension is also the regulator's act, and
    // the plugin notifies it (LicensesDecoder -> `licenses:<block>`).
    this.socketService.vaultUpdated$.subscribe(p => {
      if (p?.type !== 'party_grants' && p?.type !== 'licenses') return;
      if (this.grantRefreshTimer) clearTimeout(this.grantRefreshTimer);
      this.grantRefreshTimer = setTimeout(() => { this.grantRefreshTimer = null; this.refresh(); }, 1000);
    });
  }

  /** Effective DEX visibility = env kill switch AND admin menu toggle. */
  dex = (): boolean => this.envDex() && this.menuEnabled('dex');

  private holds(classId: number): boolean {
    return (this.licenses()?.held ?? []).includes(classId);
  }

  /**
   * True when this tenant holds NO Token Issuer licence — derived from the licences held, not from
   * a mode. Its call sites (the dashboard swap, the services list/detail columns) all ask "is this
   * an issuer?" — Verification Level / Coverage / Shortfall are issuer-service concepts.
   * False before the licences load, so the first paint never guesses a provider layout.
   */
  isServiceProvider = (): boolean => this.licenses() != null && !this.holds(PARTY_CLASS.TOKEN_ISSUER);

  /**
   * True for a clearing house: it holds a clearing-house licence (5 or the escrow CH 6) and is not
   * an issuer. Used ONLY to pick the dashboard variant — deliberately not `menuEnabled('clearing')`,
   * which an exchange whose trades are cleared also reaches.
   */
  isClearingHouse = (): boolean =>
    (this.holds(PARTY_CLASS.CLEARING_HOUSE) || this.holds(PARTY_CLASS.ESCROW_CH)) && !this.holds(PARTY_CLASS.TOKEN_ISSUER);

  /** True once the licence set is KNOWN and empty — a fresh entity its regulator has not licensed yet. */
  awaitingLicenses = (): boolean => {
    const l = this.licenses();
    return !!l && l.determined && (l.held ?? []).length === 0;
  };

  /**
   * Whether the tenant's licences cover a menu key. ONLY `not-covered` closes it: `undetermined`
   * (the API could not read the licence set) stays open, because "we could not ask" must never
   * render as "you were refused" — that sends the tenant to its regulator for a licence it may
   * already hold. Core/unknown/absent all read as covered.
   */
  licenseCovers(key: string): boolean {
    return this.licenses()?.menu?.[key]?.state !== 'not-covered';
  }

  /** The licence block for one menu key, for a surface that wants to explain a missing module. */
  licenseFor(key: string) {
    return this.licenses()?.menu?.[key] ?? null;
  }

  /**
   * Whether a toggleable menu group is enabled. Unknown keys default to enabled.
   * Layers, all server-resolved: the regulator's LICENCES, then the served map (admin toggle with
   * the regulator's GRANTS folded in). The route guard reads this too, so a hidden module is also
   * unreachable.
   */
  menuEnabled(key: string): boolean {
    if (!this.licenseCovers(key)) return false; // regulator-issued licence ceiling
    const m = this.menu();
    return key in m ? m[key] : true;           // admin toggle ∧ grant ceiling
  }

  /** Whether a per-user System Function (action button) is enabled. Unknown keys default to enabled. */
  systemFunctionEnabled(key: string): boolean {
    const m = this.systemFunctions();
    return key in m ? m[key] : true;
  }

  refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        // Authenticated ⇒ read the per-user effective map; pre-login ⇒ the public tenant map.
        const token = await this.session.getActiveToken().catch(() => null);
        const features = token
          ? await this.apiService.vaultMyFeatures()
          : await this.apiService.vaultFeatures();
        this.envDex.set(!!features?.dex);
        // Keep the last known precision when the server didn't answer — a blip must not
        // re-render every figure.
        if (features?.currencyDecimals != null) this.currencyDecimals.set(features.currencyDecimals);
        // Keep the last known licence fold on a blip: a failed fetch must not re-show a module the
        // regulator has not licensed.
        if (features?.licenses) this.licenses.set(features.licenses);
        this.menu.set(features?.menu ?? {});
        // System functions only come back on the authenticated (per-user) call.
        this.systemFunctions.set((features as any)?.systemFunctions ?? {});
      } finally {
        this.loaded.set(true);
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}
