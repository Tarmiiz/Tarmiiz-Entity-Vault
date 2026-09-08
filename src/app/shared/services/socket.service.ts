import { inject, Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { ConfigService } from './config.service';
import { SessionService } from './session.service';

@Injectable({
  providedIn: 'root'
})
export class SocketService {

  private configService = inject(ConfigService);
  private sessionService = inject(SessionService);

  private socket: Socket | null = null;

  /** Fires whenever the backend emits `vault:updated` */
  readonly vaultUpdated$ = new Subject<{ type: string; ts: number }>();

  /** Fires whenever the backend emits `audit:appended` (new audit rows available) */
  readonly auditAppended$ = new Subject<{ count: number; lastBlock: number }>();

  /** Fires when a maker submits a new approval (`approvals:created`). */
  readonly approvalsCreated$ = new Subject<{ approval: any; ts: number }>();

  /** Fires when a pending approval transitions out of Pending (`approvals:decided`). */
  readonly approvalsDecided$ = new Subject<{ approval: any; ts: number }>();

  /** Reactive connection state — true when socket is connected */
  readonly connected = signal(false);

  /**
   * 🔴 CONCURRENCY-SAFE. `connect()` is called un-awaited from TWO places that both run at
   * login — `AuthService.login` and `AuthorizedLayoutComponent`'s constructor — and the old
   * guard was `if (this.socket?.connected) return;` placed BEFORE an `await`. During that await
   * `this.socket` was still null, so both callers passed the guard and TWO `io()` connections
   * were created. The first was orphaned but stayed connected with its own `vault:updated`
   * handler still pushing into the same Subject, and `disconnect()` only cleared the current
   * reference — so every server broadcast was delivered TWICE, forever, and every listener did
   * its work twice. Measured on the Granite tenant 2026-09-08: 14 CONNECT against 9 DISCONNECT.
   *
   * Two changes close it: the in-flight promise below, and testing `this.socket` rather than
   * `this.socket?.connected` — socket.io reconnects on its own (`reconnection: true`), so an
   * existing-but-disconnected socket must NOT be replaced with a second one.
   */
  private connecting: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this.socket) return;
    if (this.connecting) return this.connecting;

    this.connecting = this._connect().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  private async _connect(): Promise<void> {
    const token = await this.sessionService.getActiveToken();
    if (!token) return;

    // Re-check after the await: `disconnect()` may have run while we were suspended, and a
    // second caller may have been admitted before `connecting` was assigned on the first tick.
    if (this.socket) return;

    this.socket = io(this.configService.get('socketURL'), {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      console.log('[SocketService] connected:', this.socket?.id);
      this.connected.set(true);
    });

    this.socket.on('vault:updated', (payload: { type: string; ts: number }) => {
      this.vaultUpdated$.next(payload);
    });

    this.socket.on('audit:appended', (payload: { count: number; lastBlock: number }) => {
      this.auditAppended$.next(payload);
    });

    this.socket.on('approvals:created', (payload: { approval: any; ts: number }) => {
      this.approvalsCreated$.next(payload);
    });

    this.socket.on('approvals:decided', (payload: { approval: any; ts: number }) => {
      this.approvalsDecided$.next(payload);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[SocketService] disconnected:', reason);
      this.connected.set(false);
    });

    this.socket.on('connect_error', async (err) => {
      console.warn('[SocketService] connect error:', err.message);
      this.connected.set(false);
      const fresh = await this.sessionService.getActiveToken();
      if (fresh && this.socket) (this.socket as any).auth = { token: fresh };
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected.set(false);
  }
}
