import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { SessionService } from './session.service';

// The entity mode id of a Token Issuer — the one mode with no menu restriction, and the
// safe default before the first features fetch lands. Mirrors the 'Entity Mode' Global
// Variables category (see the Entity API's MODE_MENU).
const MODE_TOKEN_ISSUER = 1;

@Injectable({ providedIn: 'root' })
export class FeaturesService {
  private apiService = inject(ApiService);
  private session = inject(SessionService);

  // env-level DEX kill switch, kept separate from the admin menu toggle.
  private envDex = signal(false);
  loaded = signal(false);

  // Tenant entity mode, SERVER-owned (Entity API app_config VAULT_MODE = an 'Entity Mode'
  // Global Variables variable_id, edited from the admin System Configuration page). Null
  // until the first features fetch lands; treated as Token Issuer until then.
  private mode = signal<number | null>(null);

  // The menu keys this tenant's mode permits, as served by the API. `null` = unrestricted
  // (Token Issuer). Held as served rather than derived locally, so adding a provider type
  // is an Entity API + Global Variables change with no Vault rebuild.
  private modeMenu = signal<string[] | null>(null);

  // Per-tenant admin menu toggles { key: enabled }. Absent key ⇒ treated as enabled,
  // so core/unknown items never disappear.
  menu = signal<Record<string, boolean>>({});

  // Decimal places every MONEY value renders with — SERVER-owned (Entity API app_config
  // CURRENCY_DECIMALS, edited from the admin System Configuration page). Read by MoneyPipe
  // and UtilsService.formatPrice/roundMoney, so it governs the screen, the PDF exports and
  // the rounding applied to Excel cells alike. Seeded with the registry default so the
  // first paint (before /features lands) matches the shipped look.
  currencyDecimals = signal(6);

  // Per-user System Functions map { key: enabled } (action-button gating). Populated only
  // once authenticated (from /vault/features/me); absent key ⇒ enabled (matters only before
  // the post-login refresh, since these buttons live on authenticated pages).
  systemFunctions = signal<Record<string, boolean>>({});

  private inflight: Promise<void> | null = null;

  constructor() {
    // Eagerly fetch on first injection so menu/route guards have an answer ASAP.
    this.refresh();
  }

  /** Effective DEX visibility = env kill switch AND admin menu toggle. */
  dex = (): boolean => this.envDex() && this.menuEnabled('dex');

  /**
   * True when this tenant runs any service-provider mode (Token Issuer is the default).
   * Its non-menu call sites (the dashboard swap, the services list/detail columns) all ask
   * "is this an issuer service?" — Verification Level / Coverage / Shortfall are
   * issuer-service concepts and stay hidden for every provider type.
   */
  isServiceProvider = (): boolean => (this.mode() ?? MODE_TOKEN_ISSUER) !== MODE_TOKEN_ISSUER;

  /** Whether a toggleable key is permitted by the deployment's entity-type mode. */
  modeAllows(key: string): boolean {
    const allowed = this.modeMenu();
    return allowed === null || allowed.includes(key);
  }

  /** Whether a toggleable menu group is enabled. Unknown keys default to enabled. */
  menuEnabled(key: string): boolean {
    if (!this.modeAllows(key)) return false;   // entity-type hard-restrict
    const m = this.menu();
    return key in m ? m[key] : true;           // admin toggle
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
        // Authenticated ⇒ read the per-user effective map (tenant folded with this
        // user's restrict-only overrides); pre-login ⇒ the public tenant map. The
        // server applies the restrict-only fold, so menuEnabled()/dex() are unchanged.
        const token = await this.session.getActiveToken().catch(() => null);
        const features = token
          ? await this.apiService.vaultMyFeatures()
          : await this.apiService.vaultFeatures();
        this.envDex.set(!!features?.dex);
        // Keep the last known mode + allow-list on a failed/empty fetch rather than
        // snapping back to the unrestricted default — that would briefly re-show the
        // issuer modules on a blip. modeMenu is only assigned when a mode came back with
        // it, so the two can never drift apart.
        if (features?.vaultMode != null) {
          this.mode.set(features.vaultMode);
          this.modeMenu.set(features.modeMenu ?? null);
        }
        // Keep the last known precision when the server didn't answer, for the same
        // reason as the mode above — a blip must not re-render every figure.
        if (features?.currencyDecimals != null) this.currencyDecimals.set(features.currencyDecimals);
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
