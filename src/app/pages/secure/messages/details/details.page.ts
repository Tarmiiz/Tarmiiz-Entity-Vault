import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { ConnectThread, ConnectMessage } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-messages-details',
  templateUrl: './details.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
})
export class DetailsPage implements OnInit, OnDestroy {
  private apiService     = inject(ApiService);
  private socketService  = inject(SocketService);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private loadingService = inject(LoadingService);
  utils                  = inject(UtilsService);

  threadId  = 0;
  thread    = signal<ConnectThread | null>(null);
  messages  = signal<ConnectMessage[]>([]);
  entityAddress = '';

  composeText   = signal('');
  broadcastText = signal('');

  private sub?: Subscription;

  async ngOnInit() {
    this.threadId = Number(this.route.snapshot.paramMap.get('id'));

    this.sub = this.socketService.vaultUpdated$.subscribe(p => {
      if (p.type === 'connect' || p.type === 'all') this.reload();
    });

    await this.reload();
  }

  private resolveEntityAddress() {
    const t = this.thread();
    if (!t) return;
    // Creator is either this entity (if we created the thread) or the entity participant (partyType=2)
    if (t.creatorType === 2) {
      this.entityAddress = t.creator.toLowerCase();
      return;
    }
    const mine = (t.participants || []).find(p => p.partyType === 2);
    if (mine) this.entityAddress = mine.address.toLowerCase();
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async reload() {
    const threadResp = await this.apiService.connectThreadGet(this.threadId);
    if (threadResp?.thread) {
      this.thread.set(threadResp.thread);
      this.resolveEntityAddress();
    }
    const msgsResp = await this.apiService.connectMessagesList(this.threadId, 1, 200);
    if (msgsResp?.messages) this.messages.set(msgsResp.messages);
  }

  participantType(partyType: number | null): string {
    return partyType === 1 ? 'Identity' : partyType === 2 ? 'Entity' : partyType === 3 ? 'Regulator' : '—';
  }

  isEntityCreator(): boolean {
    const t = this.thread();
    return !!t && t.creator.toLowerCase() === this.entityAddress;
  }

  hasSubscriptionParticipants(): boolean {
    const t = this.thread();
    return !!t && t.subscriptions && t.subscriptions.length > 0;
  }

  async send() {
    const t = this.thread();
    if (!t || !this.composeText()) return;
    const others = (t.participants || []).filter(p => p.address.toLowerCase() !== this.entityAddress);
    const recipient = others[0];
    if (!recipient) return;

    const cid = this.composeText();

    this.loadingService.show('Sending...');
    await this.apiService.connectMessageSend(t.id, { recipient: recipient.address, cid, contentType: 1 });
    this.composeText.set('');
    this.loadingService.hide();
    await this.reload();
  }

  async broadcast() {
    if (!this.broadcastText()) return;
    this.loadingService.show('Broadcasting to subscribers...');
    await this.apiService.connectThreadBroadcast(this.threadId, this.broadcastText(), 4);
    this.broadcastText.set('');
    this.loadingService.hide();
    await this.reload();
  }

  async closeThread() {
    if (!confirm('Close this thread?')) return;
    this.loadingService.show('Closing...');
    await this.apiService.connectThreadClose(this.threadId, '');
    this.loadingService.hide();
    await this.reload();
  }

  async markRead(m: ConnectMessage) {
    if (m.readAt || m.sender.toLowerCase() === this.entityAddress) return;
    await this.apiService.connectMessageMarkRead(m.id);
    await this.reload();
  }

  async tombstone(m: ConnectMessage) {
    if (m.sender.toLowerCase() !== this.entityAddress) return;
    if (!confirm('Tombstone (hide) this message?')) return;
    await this.apiService.connectMessageTombstone(m.id);
    await this.reload();
  }

  isMine(m: ConnectMessage): boolean {
    return m.sender.toLowerCase() === this.entityAddress;
  }
}
