import { Injectable } from '@angular/core';

export interface AppConfig {
  apiURL: string;
  socketURL: string;
  brandPrimary?: string;
  brandPrimaryHover?: string;
  // NOTE: there is deliberately no `vaultMode` here. The entity mode is the Entity API's
  // app_config VAULT_MODE — an 'Entity Mode' Global Variables variable_id — and arrives on
  // /vault/features together with its menu allow-list. A static mirror here would be a
  // second, divergent identifier space; FeaturesService instead defaults to Token Issuer
  // for the window before the first fetch resolves and keeps the last known value after.
}

const BRAND_DEFAULTS = {
  brandPrimary: '#202a3b',
  brandPrimaryHover: '#2c3648',
};

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private cfg: AppConfig | null = null;

  async load(): Promise<void> {
    const res = await fetch('assets/config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`ConfigService: failed to load assets/config.json (${res.status})`);
    this.cfg = await res.json();
    this.applyBrandColors();
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    if (!this.cfg) throw new Error('ConfigService: not loaded — APP_INITIALIZER must run first');
    return this.cfg[key];
  }

  private applyBrandColors(): void {
    const root = document.documentElement;
    const primary = this.cfg?.brandPrimary || BRAND_DEFAULTS.brandPrimary;
    const hover = this.cfg?.brandPrimaryHover || BRAND_DEFAULTS.brandPrimaryHover;
    root.style.setProperty('--brand-primary', primary);
    root.style.setProperty('--brand-primary-hover', hover);
  }
}
