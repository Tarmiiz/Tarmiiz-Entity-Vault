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

  // A refresh we could not complete is not a failed session. If the access token has real
  // time left (we refresh ~60s early), hand it back so the caller keeps working and the
  // guard does not bounce; once it is genuinely expired there is nothing usable to return.
  private tokenIfUnexpired(): string | null {
    return Date.now() < this.expiresAt ? this.token : null;
  }

  private async refreshToken(): Promise<string | null> {
    if (this._refreshInFlight) return this._refreshInFlight;
    this._refreshInFlight = (async () => {
      try {
        const apiURL = this.configService.get('apiURL');
        const response = await CapacitorHttp.request({
          method: 'POST',
          url: apiURL + '/entity/refresh',
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
        // ONLY a definitive rejection ends the session. This used to clear on any
        // non-success, which meant a refresh landing while the API was restarting hit the
        // catch below, wiped the stored token, and logged the user out — defeating the
        // whole point of the API keeping sessions across restarts. A 503 (store briefly
        // unreachable), a 5xx, or a proxy error page all mean "we could not ask", not
        // "you are logged out".
        if (response.status === 401) {
          await this.clear();
          return null;
        }
        return this.tokenIfUnexpired();
      } catch {
        // Network-level failure — the API is restarting, offline, or unreachable. Keep the
        // token: the next attempt succeeds once it is back, provided we are still inside
        // the refresh window (getActiveToken checks that before ever calling us).
        return this.tokenIfUnexpired();
      } finally {
        this._refreshInFlight = null;
      }
    })();
    return this._refreshInFlight;
  }
}
