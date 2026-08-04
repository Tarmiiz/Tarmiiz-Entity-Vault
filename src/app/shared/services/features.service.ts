import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { ConfigService } from './config.service';
import { SessionService } from './session.service';

// Toggleable menu keys a service-provider deployment may show. Everything else
// (assets, subscriptions, transactions, credit, analytics, dex, custody, variables)
// is hidden in service-provider mode regardless of the admin menu toggle.
const SERVICE_PROVIDER_MENU = new Set([
  'services', 'documents', 'messages', 'signer-keys', 'approvals', 'logs',
]);

@Injectable({ providedIn: 'root' })
export class FeaturesService {
  private apiService = inject(ApiService);
  private config = inject(ConfigService);
  private session = inject(SessionService);

  // env-level DEX kill switch, kept separate from the admin menu toggle.
  private envDex = signal(false);
  loaded = signal(false);

  // Tenant entity mode, SERVER-owned (Entity API app_config VAULT_MODE, edited from the
  // admin System Configuration page). Null until the first features fetch lands, which is
  // the only window where the config.json fallback below still matters.
  private mode = signal<string | null>(null);

  // Per-tenant admin menu toggles { key: enabled }. Absent key ⇒ treated as enabled,
  // so core/unknown items never disappear.
  menu = signal<Record<string, boolean>>({});

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

  /** True when this tenant runs in service-provider mode (issuer is the default). */
  isServiceProvider = (): boolean =>
    (this.mode() ?? this.config.get('vaultMode') ?? 'issuer') === 'service-provider';

  /** Whether a toggleable key is permitted by the deployment's entity-type mode. */
  modeAllows(key: string): boolean {
    return !this.isServiceProvider() || SERVICE_PROVIDER_MENU.has(key);
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
        // Keep the last known mode on a failed/empty fetch rather than snapping back to
        // the config.json default — that would briefly re-show issuer modules on a blip.
        if (features?.vaultMode) this.mode.set(features.vaultMode);
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
