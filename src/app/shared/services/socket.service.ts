import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SocketService {

  private socket: Socket | null = null;

  /** Fires whenever the backend emits `vault:updated` */
  readonly vaultUpdated$ = new Subject<{ type: string; ts: number }>();

  /** Fires whenever the backend emits `audit:appended` (new audit rows available) */
  readonly auditAppended$ = new Subject<{ count: number; lastBlock: number }>();

  /** Reactive connection state — true when socket is connected */
  readonly connected = signal(false);

  connect() {
    if (this.socket?.connected) return;

    this.socket = io(environment.socketURL, {
      auth: { token: environment.vaultToken },
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

    this.socket.on('disconnect', (reason) => {
      console.log('[SocketService] disconnected:', reason);
      this.connected.set(false);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[SocketService] connect error:', err.message);
      this.connected.set(false);
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected.set(false);
  }
}
