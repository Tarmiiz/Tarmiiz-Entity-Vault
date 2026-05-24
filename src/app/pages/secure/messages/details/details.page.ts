import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../../shared/components/live-indicator/live-indicator.component';
import { ApiService } from '../../../../shared/services/api.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { ConnectThread, ConnectMessage } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-messages-details',
  templateUrl: './details.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HeaderComponent, LiveIndicatorComponent, TranslatePipe],
})
export class DetailsPage implements OnInit, OnDestroy {
  private apiService     = inject(ApiService);
  private socketService  = inject(SocketService);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  utils                  = inject(UtilsService);

  threadId  = 0;
  thread    = signal<ConnectThread | null>(null);
  messages  = signal<ConnectMessage[]>([]);
  messageTexts = signal<Record<string, string>>({});
  entityAddress = '';

  // address (lower-cased) → resolved { name, partyType } from Directory Registry
  directory = signal<Record<string, { name: string; partyType: number }>>({});

  // bytes32 createdByUserId hex → resolved local user (null when not in this
  // entity's user table — typical for cross-tenant attribution hashes).
  userByHash = signal<Record<string, { id: number; name: string } | null>>({});

  composeText   = signal('');
  broadcastText = signal('');

  markingRead = signal<Record<string, true>>({});
  isMarkingRead(id: string | number): boolean { return !!this.markingRead()[String(id)]; }

  deleting = signal<Record<string, true>>({});
  isDeleting(id: string | number): boolean { return !!this.deleting()[String(id)]; }

  activeTab = signal<'conversation' | 'info' | 'participants'>('conversation');
  refreshing = signal(false);
  setTab(tab: 'conversation' | 'info' | 'participants') { this.activeTab.set(tab); }

  stateName(state: number | undefined): string {
    return state === 1 ? 'Open' : state === 2 ? 'Closed' : state === 3 ? 'Archived' : '—';
  }

  getStateClass(state: number | undefined): string {
    switch (state) {
      case 1: return 'bg-green-100 text-green-800';
      case 2: return 'bg-gray-100 text-gray-700';
      case 3: return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  private sub?: Subscription;

  async ngOnInit() {
    this.threadId = Number(this.route.snapshot.paramMap.get('id'));

    const cfg = await this.apiService.vaultGetConfig();
    this.entityAddress = (cfg?.entityContract || '').toLowerCase();

    this.sub = this.socketService.vaultUpdated$.subscribe(p => {
      if (p.type === 'connect' || p.type === 'all') this.reload(true);
    });

    await this.reload();
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async reload(silent = false) {
    if (silent) this.refreshing.set(true);
    try {
    const threadResp = await this.apiService.connectThreadGet(this.threadId);
    if (threadResp?.thread) {
      this.thread.set(threadResp.thread);
      this.resolveDirectory(threadResp.thread);
      this.resolveUserAttribution([threadResp.thread.createdByUserId].filter(Boolean) as string[]);
    }
    const msgsResp = await this.apiService.connectMessagesList(this.threadId, 1, 200);
    if (msgsResp?.messages) {
      this.messages.set(msgsResp.messages);
      this.resolveMessageTexts(msgsResp.messages);
      this.resolveMessageSenders(msgsResp.messages);
      this.resolveUserAttribution(msgsResp.messages.map((m: ConnectMessage) => m.createdByUserId).filter(Boolean) as string[]);
    }
    } finally {
      if (silent) this.refreshing.set(false);
    }
  }

  private async resolveUserAttribution(hashes: string[]) {
    const cache = { ...this.userByHash() };
    const toFetch = Array.from(new Set(hashes)).filter(h => !(h in cache));
    if (toFetch.length === 0) return;
    await Promise.all(toFetch.map(async h => {
      cache[h] = await this.apiService.userByCreatedByHash(h);
    }));
    this.userByHash.set(cache);
  }

  private async resolveMessageSenders(msgs: ConnectMessage[]) {
    const current = { ...this.directory() };
    const addrs = new Set<string>();
    for (const m of msgs) {
      if (m.sender) addrs.add(m.sender.toLowerCase());
      if (m.recipient) addrs.add(m.recipient.toLowerCase());
    }
    const toFetch = Array.from(addrs).filter(a => !current[a]);
    if (toFetch.length === 0) return;
    await Promise.all(toFetch.map(async a => {
      try {
        const resp = await this.apiService.directoryByAddress(a);
        const e = resp?.entry;
        if (e?.name) current[a] = { name: e.name, partyType: e.partyType };
      } catch { /* ignore */ }
    }));
    this.directory.set(current);
  }

  senderLabel(m: ConnectMessage): string {
    if (this.isMine(m)) return 'me';
    const partyName = this.nameFor(m.sender) || ((m.sender || '').slice(0, 8) + '…');
    const user = m.createdByUserId ? this.userByHash()[m.createdByUserId] : null;
    return user ? `${user.name} (${partyName})` : partyName;
  }

  private async resolveDirectory(t: ConnectThread) {
    const current = { ...this.directory() };
    const addrs = new Set<string>();
    if (t.creator) addrs.add(t.creator.toLowerCase());
    for (const p of (t.participants || [])) if (p.address) addrs.add(p.address.toLowerCase());
    const toFetch = Array.from(addrs).filter(a => !current[a]);
    if (toFetch.length === 0) return;
    await Promise.all(toFetch.map(async a => {
      try {
        const resp = await this.apiService.directoryByAddress(a);
        const e = resp?.entry;
        if (e?.name) current[a] = { name: e.name, partyType: e.partyType };
      } catch { /* not in directory — keep raw address fallback */ }
    }));
    this.directory.set(current);
  }

  nameFor(address: string): string {
    if (!address) return '—';
    return this.directory()[address.toLowerCase()]?.name || '';
  }

  resolvedPartyType(address: string, fallback: number | null): number | null {
    const d = this.directory()[(address || '').toLowerCase()];
    return d ? d.partyType : fallback;
  }

  private async resolveMessageTexts(msgs: ConnectMessage[]) {
    const current = { ...this.messageTexts() };
    const toFetch = msgs.filter(m => m.state !== 2 && m.contentCid && !current[m.contentCid]);
    if (toFetch.length === 0) return;
    await Promise.all(toFetch.map(async m => {
      try {
        const resp = await this.apiService.connectMessageContent(m.contentCid);
        if (resp?.text != null) current[m.contentCid] = resp.text;
      } catch { /* ignore */ }
    }));
    this.messageTexts.set(current);
  }

  textFor(m: ConnectMessage): string {
    if (m.state === 2) return '(message deleted)';
    return this.messageTexts()[m.contentCid] ?? '…';
  }

  participantType(partyType: number | null): string {
    return partyType === 1 ? 'Identity'
         : partyType === 2 ? 'Entity'
         : partyType === 3 ? 'Regulator'
         : partyType === 4 ? 'Service'
         : '—';
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

    const text = this.composeText();

    this.loadingService.show('Sending...');
    await this.apiService.connectMessageSend(t.id, { recipient: recipient.address, text, contentType: 1 });
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
    const ok = await this.alertService.show('Close thread', 'Close this thread? Participants will no longer be able to send messages.', 'Close');
    if (!ok) return;
    this.loadingService.show('Closing...');
    await this.apiService.connectThreadClose(this.threadId, '');
    this.loadingService.hide();
    await this.reload();
  }

  async markRead(m: ConnectMessage) {
    if (m.readAt || m.sender.toLowerCase() === this.entityAddress) return;
    const key = String(m.id);
    if (this.markingRead()[key]) return;
    this.markingRead.update(s => ({ ...s, [key]: true }));
    try {
      await this.apiService.connectMessageMarkRead(m.id);
      await this.reload();
    } finally {
      this.markingRead.update(s => {
        const { [key]: _, ...rest } = s;
        return rest;
      });
    }
  }

  async tombstone(m: ConnectMessage) {
    if (m.sender.toLowerCase() !== this.entityAddress) return;
    const key = String(m.id);
    if (this.deleting()[key]) return;
    const ok = await this.alertService.show('Delete message', 'Delete this message? This cannot be undone.', 'Delete');
    if (!ok) return;
    this.deleting.update(s => ({ ...s, [key]: true }));
    try {
      await this.apiService.connectMessageTombstone(m.id);
      await this.reload();
    } finally {
      this.deleting.update(s => {
        const { [key]: _, ...rest } = s;
        return rest;
      });
    }
  }

  isMine(m: ConnectMessage): boolean {
    return m.sender.toLowerCase() === this.entityAddress;
  }
}
