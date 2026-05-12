import { Injectable } from '@angular/core';

export interface AppConfig {
  apiURL: string;
  socketURL: string;
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private cfg: AppConfig | null = null;

  async load(): Promise<void> {
    const res = await fetch('assets/config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`ConfigService: failed to load assets/config.json (${res.status})`);
    this.cfg = await res.json();
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    if (!this.cfg) throw new Error('ConfigService: not loaded — APP_INITIALIZER must run first');
    return this.cfg[key];
  }
}
