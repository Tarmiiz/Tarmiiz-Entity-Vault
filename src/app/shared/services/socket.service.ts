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

  async connect() {
    if (this.socket?.connected) return;

    const token = await this.sessionService.getActiveToken();
    if (!token) return;

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
