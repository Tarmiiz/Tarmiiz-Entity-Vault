import { inject, Injectable } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';

import { ConfigService } from './config.service';
import { StorageService } from './storage.service';

// Holds the active access token + refresh schedule. ApiService reads the
// token through getActiveToken() which transparently refreshes when within
// REFRESH_LEEWAY_MS of expiry. SocketService reads it for the WS handshake.
@Injectable({ providedIn: 'root' })
export class SessionService {
  private configService = inject(ConfigService);
  private storageService = inject(StorageService);

  private REFRESH_LEEWAY_MS = 60 * 1000;

  private token: string | null = null;
  private expiresAt = 0;
  private refreshExpiresAt = 0;

  private _refreshInFlight: Promise<string | null> | null = null;
  private _ready: Promise<void>;

  constructor() {
    this._ready = this.hydrate();
  }

  ready() { return this._ready; }

  private async hydrate() {
    const [t, e, r] = await Promise.all([
      this.storageService.get('sessionToken'),
      this.storageService.get('sessionTokenExpiresAt'),
      this.storageService.get('sessionRefreshExpiresAt'),
    ]);
    this.token = t || null;
    this.expiresAt = Number(e) || 0;
    this.refreshExpiresAt = Number(r) || 0;
  }

  async setSession(token: string, expiresAt: number, refreshExpiresAt: number) {
    this.token = token;
    this.expiresAt = expiresAt;
    this.refreshExpiresAt = refreshExpiresAt;
    await Promise.all([
      this.storageService.set('sessionToken', token),
      this.storageService.set('sessionTokenExpiresAt', String(expiresAt)),
      this.storageService.set('sessionRefreshExpiresAt', String(refreshExpiresAt)),
    ]);
  }

  async clear() {
    this.token = null;
    this.expiresAt = 0;
    this.refreshExpiresAt = 0;
    await Promise.all([
      this.storageService.remove('sessionToken'),
      this.storageService.remove('sessionTokenExpiresAt'),
      this.storageService.remove('sessionRefreshExpiresAt'),
    ]);
  }

  hasSession(): boolean {
    return !!this.token && Date.now() < this.refreshExpiresAt;
  }

  async getActiveToken(): Promise<string | null> {
    await this._ready;
    if (!this.token) return null;
    const now = Date.now();
    if (now >= this.refreshExpiresAt) {
      await this.clear();
      return null;
    }
    if (now < this.expiresAt - this.REFRESH_LEEWAY_MS) return this.token;
    return await this.refreshToken();
  }

  private async refreshToken(): Promise<string | null> {
    if (this._refreshInFlight) return this._refreshInFlight;
    this._refreshInFlight = (async () => {
      try {
        const apiURL = this.configService.get('apiURL');
        const response = await CapacitorHttp.request({
          method: 'POST',
          url: apiURL + '/vault/entity/refresh',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (this.token || ''),
          },
          data: {},
        });
        if (response.data?.type === 'success' && response.data?.token) {
          await this.setSession(response.data.token, response.data.expiresAt, response.data.refreshExpiresAt);
          return this.token;
        }
        await this.clear();
        return null;
      } catch {
        await this.clear();
        return null;
      } finally {
        this._refreshInFlight = null;
      }
    })();
    return this._refreshInFlight;
  }
}
