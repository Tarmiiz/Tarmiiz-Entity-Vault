import { Component, OnInit, OnDestroy, signal, inject , computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../../shared/components/live-indicator/live-indicator.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { ConnectThread, ConnectMessage, ConnectMessageRecipient, ConnectAttachmentMeta } from '../../../../shared/models/data.model';
import { TabsComponent, TabDef } from '../../../../shared/components/tabs/tabs.component';
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';

const ZERO_HASH = '0x' + '0'.repeat(64);

@Component({
  selector: 'app-messages-details',
  templateUrl: './details.page.html',
  standalone: true,
  imports: [LoadingStateComponent, TabsComponent, CommonModule, FormsModule, RouterLink, HeaderComponent, LiveIndicatorComponent, TranslatePipe],
})
export class DetailsPage implements OnInit, OnDestroy {
  private apiService     = inject(ApiService);
  private socketService  = inject(SocketService);
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService   = inject(AlertService);
  private translate      = inject(TranslateService);
  private authService    = inject(AuthService);
  utils                  = inject(UtilsService);

  // Security officer (role 4) — read-only full-audit view: no write surface,
  // and viewing must not mutate read-state (passive audit).
  get isReadOnly(): boolean { return Number(this.authService.userInfo?.role) === 4; }

  threadId  = 0;
  thread    = signal<ConnectThread | null>(null);
  messages  = signal<ConnectMessage[]>([]);
  // messageId -> decrypted { text, attachments } from the gated content route
  messageContents = signal<Record<number, { text: string; attachments: ConnectAttachmentMeta[] }>>({});
  entityAddress = '';

  // address (lower-cased) → resolved { name, partyType } from Directory Registry
  directory = signal<Record<string, { name: string; partyType: number }>>({});

  // bytes32 createdByUserId hex → resolved local user (null when not in this
  // entity's user table — typical for cross-tenant attribution hashes).
  userByHash = signal<Record<string, { id: number; name: string } | null>>({});

  composeText = signal('');
  // Reply mode: 'all' = empty to[] (on-chain snapshot of every participant);
  // 'sender' = privately to the selected message's sender (+ its sending user
  // when attributed — a user-DIRECT message only that user + we can read).
  replyMode = signal<'all' | 'sender'>('all');
  replyToMessage = signal<ConnectMessage | null>(null);
  composeFiles = signal<File[]>([]);

  deleting = signal<Record<string, true>>({});
  isDeleting(id: string | number): boolean { return !!this.deleting()[String(id)]; }

  downloading = signal<Record<string, true>>({});
  isDownloading(key: string): boolean { return !!this.downloading()[key]; }

  // Participants tab — add form
  addSearchTerm = signal('');
  addSearchResults = signal<any[]>([]);
  addSelected = signal<any[]>([]);
  adding = signal(false);

  // Compose To — user-handle targets (alice@partyName) for DIRECT messages.
  // Non-empty toTargets override the reply mode entirely.
  toSearchTerm = signal('');
  toSearchResults = signal<any[]>([]);
  toTargets = signal<{ label: string; target: any }[]>([]);

  activeTab = signal<'conversation' | 'info' | 'participants'>('conversation');

  /** The tab bar (Standard 2). */
  tabDefs = computed<TabDef[]>(() => [
    { key: 'conversation',  label: 'messages.details.conversation' },
    { key: 'info',          label: 'messages.details.infoTab' },
    { key: 'participants',  label: 'messages.list.table.participants' },
  ]);

  refreshing = signal(false);
  setTab(tab: 'conversation' | 'info' | 'participants') { this.activeTab.set(tab); }

  stateName(state: number | undefined): string {
    return state === 1 ? this.translate.instant('state.open')
         : state === 2 ? this.translate.instant('state.closed')
         : state === 3 ? this.translate.instant('state.archived')
         : this.translate.instant('state.unknown');
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
        this.resolveMessageContents(msgsResp.messages);
        this.resolveMessageParties(msgsResp.messages);
        this.autoMarkRead();
      }
    } finally {
      if (silent) this.refreshing.set(false);
    }
  }

  // Opening a thread marks its unread incoming messages read (no per-message
  // button). Reuses the markRead eligibility; role 4 stays passive (audit).
  private async autoMarkRead() {
    if (this.isReadOnly) return;
    const ids = this.messages()
      .filter(m => !this.isMine(m) && this.isRecipient(m) && !this.myReadAt(m))
      .map(m => m.id);
    if (ids.length === 0) return;
    try { await this.apiService.connectMessagesMarkBatchRead(ids); }
    catch { /* non-fatal — read receipts refresh on the next sync */ }
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

  private async resolveMessageParties(msgs: ConnectMessage[]) {
    const current = { ...this.directory() };
    const addrs = new Set<string>();
    for (const m of msgs) {
      if (m.sender) addrs.add(m.sender.toLowerCase());
      for (const r of (m.recipients || [])) if (r.party) addrs.add(r.party.toLowerCase());
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
    if (this.isMine(m)) return this.translate.instant('messages.details.me');
    // createdByUserId is a tenant-local user id and cannot be resolved for an
    // external sender — show the directory party name, truncated address fallback.
    return this.nameFor(m.sender) || ((m.sender || '').slice(0, 8) + '…');
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
    if (!address) return this.translate.instant('common.notSet');
    return this.directory()[address.toLowerCase()]?.name || '';
  }

  resolvedPartyType(address: string, fallback: number | null): number | null {
    const d = this.directory()[(address || '').toLowerCase()];
    return d ? d.partyType : fallback;
  }

  // v2 content: fetched per message via the DM-visibility-gated route (which
  // also decrypts late-join history via on-chain grants).
  private async resolveMessageContents(msgs: ConnectMessage[]) {
    const current = { ...this.messageContents() };
    const toFetch = msgs.filter(m => m.state !== 2 && !current[m.id]);
    if (toFetch.length === 0) return;
    await Promise.all(toFetch.map(async m => {
      try {
        const resp = await this.apiService.connectMessageContentById(m.id);
        if (resp?.text != null) current[m.id] = { text: resp.text, attachments: resp.attachments || [] };
      } catch { /* ignore */ }
    }));
    this.messageContents.set(current);
  }

  textFor(m: ConnectMessage): string {
    if (m.state === 2) return this.translate.instant('messages.details.messageDeleted');
    return this.messageContents()[m.id]?.text ?? '…';
  }

  attachmentsFor(m: ConnectMessage): ConnectAttachmentMeta[] {
    return this.messageContents()[m.id]?.attachments || [];
  }

  async downloadAttachment(m: ConnectMessage, idx: number) {
    const key = m.id + ':' + idx;
    if (this.downloading()[key]) return;
    this.downloading.update(s => ({ ...s, [key]: true }));
    try {
      const res = await this.apiService.connectMessageAttachment(m.id, idx);
      if (res?.blobUrl) {
        const meta = this.attachmentsFor(m)[idx];
        const a = document.createElement('a');
        a.href = res.blobUrl;
        a.download = meta?.name || 'attachment';
        a.click();
        setTimeout(() => URL.revokeObjectURL(res.blobUrl), 30000);
      } else {
        this.alertService.info(
          this.translate.instant('messages.details.alerts.attachmentTitle'),
          this.translate.instant('messages.details.alerts.attachmentFailed'),
          this.translate.instant('messages.details.alerts.ok'));
      }
    } finally {
      this.downloading.update(s => { const { [key]: _, ...rest } = s; return rest; });
    }
  }

  // Recipient chip label: alice@Party for user-targeted entries, party name otherwise.
  recipientLabel(r: ConnectMessageRecipient): string {
    const partyName = this.nameFor(r.party) || (r.party || '').slice(0, 8) + '…';
    if (r.userId && r.userId !== ZERO_HASH) {
      return (r.handle || this.translate.instant('messages.details.userFallback')) + '@' + partyName;
    }
    return partyName;
  }

  isDirect(m: ConnectMessage): boolean {
    return !!m.isDirect || (m.recipients || []).some(r => r.userId && r.userId !== ZERO_HASH);
  }

  readCount(m: ConnectMessage): number {
    return (m.recipients || []).filter(r => r.readAt).length;
  }

  // My tenant's recipient row — drives the Mark-read affordance (the on-chain
  // read dedupes per party; the local row is the per-user truth).
  private myRecipientRow(m: ConnectMessage): ConnectMessageRecipient | undefined {
    return (m.recipients || []).find(r => (r.party || '').toLowerCase() === this.entityAddress);
  }

  myReadAt(m: ConnectMessage): number | null {
    return this.myRecipientRow(m)?.readAt ?? null;
  }

  isRecipient(m: ConnectMessage): boolean {
    return !!this.myRecipientRow(m);
  }

  participantType(partyType: number | null): string {
    return partyType === 1 ? this.translate.instant('partyType.identity')
         : partyType === 2 ? this.translate.instant('partyType.entity')
         : partyType === 3 ? this.translate.instant('partyType.regulator')
         : partyType === 4 ? this.translate.instant('partyType.service')
         : this.translate.instant('partyType.unknown');
  }

  isEntityCreator(): boolean {
    const t = this.thread();
    return !!t && t.creator.toLowerCase() === this.entityAddress;
  }

  isEntityParticipant(): boolean {
    const t = this.thread();
    return !!t && (t.participants || []).some(p =>
      p.address.toLowerCase() === this.entityAddress && p.state === 1);
  }

  onFilesSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files || []).slice(0, 10);
    this.composeFiles.set(files);
  }

  removeComposeFile(idx: number) {
    this.composeFiles.update(f => f.filter((_, i) => i !== idx));
  }

  setReplyPrivately(m: ConnectMessage) {
    if (this.isReadOnly) return;
    this.replyMode.set('sender');
    this.replyToMessage.set(m);
    this.activeTab.set('conversation');
  }

  clearReplyMode() {
    this.replyMode.set('all');
    this.replyToMessage.set(null);
  }

  // ── Compose To (user-handle DIRECT targets) ────────────────────────────────
  private toSearchTimer: any;
  onToSearch(term: string) {
    this.toSearchTerm.set(term);
    clearTimeout(this.toSearchTimer);
    if (!term || term.length < 2) { this.toSearchResults.set([]); return; }
    this.toSearchTimer = setTimeout(async () => {
      const resp = await this.apiService.connectRecipientsSearch('user', term.split('@')[0]);
      const results = (resp?.results || []).filter((r: any) =>
        !this.toTargets().some(s => s.target.party === r.party && s.target.userId === r.userId));
      this.toSearchResults.set(results.slice(0, 10));
    }, 300);
  }

  selectToResult(r: any) {
    this.toTargets.update(s => [...s, { label: r.fullAddress, target: { party: r.party, userId: r.userId } }]);
    this.toSearchResults.set([]);
    this.toSearchTerm.set('');
    this.clearReplyMode();
  }

  removeToTarget(idx: number) {
    this.toTargets.update(s => s.filter((_, i) => i !== idx));
  }

  async send() {
    if (this.isReadOnly) return;
    const t = this.thread();
    if (!t || !this.composeText()) return;

    // Priority: explicit To chips (user-DIRECT targets) → reply-privately →
    // reply-all (default; empty to[] = the chain snapshots every participant).
    let to: any[] = [];
    if (this.toTargets().length > 0) {
      to = this.toTargets().map(x => x.target);
    } else if (this.replyMode() === 'sender') {
      const m = this.replyToMessage();
      if (!m) { this.clearReplyMode(); return; }
      const target: any = { party: m.sender };
      if (m.createdByUserId && m.createdByUserId !== ZERO_HASH) target.userId = m.createdByUserId;
      to = [target];
    }

    const text = this.composeText();
    const files = this.composeFiles();

    this.loadingService.show(this.translate.instant('messages.details.loading.sending'));
    let resp: any;
    if (files.length > 0) {
      resp = await this.apiService.connectMessageSendMultipart(t.id, { to, text, subject: t.subject, contentType: 1 }, files);
    } else {
      resp = await this.apiService.connectMessageSend(t.id, { to, text, subject: t.subject, contentType: 1 });
    }
    this.loadingService.hide();
    if (resp?.error) {
      this.alertService.info(
        this.translate.instant('messages.details.alerts.sendFailedTitle'),
        resp.error,
        this.translate.instant('messages.details.alerts.ok'));
      return;
    }
    this.composeText.set('');
    this.composeFiles.set([]);
    this.toTargets.set([]);
    this.clearReplyMode();
    await this.reload();
  }

  async closeThread() {
    if (this.isReadOnly) return;
    const ok = await this.alertService.show(
      this.translate.instant('messages.details.closeThread'),
      this.translate.instant('messages.details.alerts.closeThreadConfirm'),
      this.translate.instant('common.close'));
    if (!ok) return;
    this.loadingService.show(this.translate.instant('messages.details.loading.closing'));
    await this.apiService.connectThreadClose(this.threadId, '');
    this.loadingService.hide();
    await this.reload();
  }

  async leaveThread() {
    if (this.isReadOnly) return;
    const ok = await this.alertService.show(
      this.translate.instant('messages.details.leaveThread'),
      this.translate.instant('messages.details.alerts.leaveThreadConfirm'),
      this.translate.instant('messages.details.alerts.leaveButton'));
    if (!ok) return;
    this.loadingService.show(this.translate.instant('messages.details.loading.leaving'));
    const resp = await this.apiService.connectThreadLeave(this.threadId);
    this.loadingService.hide();
    if (resp?.error) {
      this.alertService.info(
        this.translate.instant('messages.details.alerts.leaveFailed'),
        resp.error,
        this.translate.instant('messages.details.alerts.ok'));
      return;
    }
    this.router.navigate(['/authorized/messages/list']);
  }

  async removeParticipant(address: string) {
    if (this.isReadOnly) return;
    const label = this.nameFor(address) || address;
    const ok = await this.alertService.show(
      this.translate.instant('messages.details.alerts.removeParticipantTitle'),
      this.translate.instant('messages.details.alerts.removeParticipantConfirm', { label }),
      this.translate.instant('common.remove'));
    if (!ok) return;
    this.loadingService.show(this.translate.instant('messages.details.loading.removing'));
    const resp = await this.apiService.connectThreadRemoveParticipant(this.threadId, address, '');
    this.loadingService.hide();
    if (resp?.error) {
      this.alertService.info(
        this.translate.instant('messages.details.alerts.removeFailed'),
        resp.error,
        this.translate.instant('messages.details.alerts.ok'));
      return;
    }
    await this.reload();
  }

  // ── Add participants (search entities / regulators / subscriptions) ────────
  private searchTimer: any;
  onAddSearch(term: string) {
    this.addSearchTerm.set(term);
    clearTimeout(this.searchTimer);
    if (!term || term.length < 2) { this.addSearchResults.set([]); return; }
    this.searchTimer = setTimeout(async () => {
      const [entities, regulators, subscriptions, users] = await Promise.all([
        this.apiService.connectRecipientsSearch('entity', term),
        this.apiService.connectRecipientsSearch('regulator', term),
        this.apiService.connectRecipientsSearch('subscription', term),
        this.apiService.connectRecipientsSearch('user', term.split('@')[0]),
      ]);
      // Handle help: a user pick (alice@party) resolves to its PARTY — thread
      // participants are parties, not sub-users — so surface the party address.
      const userRows = (users?.results || []).map((r: any) => ({
        address: r.party, name: r.fullAddress, type: 'user',
      }));
      // Dedupe by address so a party matched by NAME wins over a handle row for
      // the same party (and a party never appears twice).
      const seen = new Set<string>();
      const results = [
        ...(entities?.results || []),
        ...(regulators?.results || []),
        ...(subscriptions?.results || []),
        ...userRows,
      ].filter(r => {
        const key = (r.address || '').toLowerCase();
        if (!key || seen.has(key) || this.addSelected().some(s => s.address === r.address)) return false;
        seen.add(key);
        return true;
      });
      this.addSearchResults.set(results.slice(0, 10));
    }, 300);
  }

  selectAddResult(r: any) {
    this.addSelected.update(s => [...s, r]);
    this.addSearchResults.set([]);
    this.addSearchTerm.set('');
  }

  unselectAdd(idx: number) {
    this.addSelected.update(s => s.filter((_, i) => i !== idx));
  }

  async addParticipants() {
    if (this.isReadOnly) return;
    // Subscription rows join as the subscriber's IDENTITY — the on-chain sugar
    // resolves {subscriptionAddr} so the DID holder (not the entity) can decrypt.
    const targets = this.addSelected().map(s =>
      s.type === 'subscription' ? { subscriptionAddr: s.address } : s.address);
    if (targets.length === 0) return;
    this.adding.set(true);
    this.loadingService.show(this.translate.instant('messages.details.loading.addingParticipants'));
    try {
      const resp = await this.apiService.connectThreadAddParticipants(this.threadId, targets);
      if (resp?.error) {
        this.alertService.info(
          this.translate.instant('messages.details.alerts.addFailedTitle'),
          resp.error,
          this.translate.instant('messages.details.alerts.ok'));
        return;
      }
      this.addSelected.set([]);
      await this.reload();
    } finally {
      this.adding.set(false);
      this.loadingService.hide();
    }
  }

  async tombstone(m: ConnectMessage) {
    if (this.isReadOnly) return;
    if (m.sender.toLowerCase() !== this.entityAddress) return;
    const key = String(m.id);
    if (this.deleting()[key]) return;
    const ok = await this.alertService.show(
      this.translate.instant('messages.details.alerts.deleteMessageTitle'),
      this.translate.instant('messages.details.alerts.deleteMessageConfirm'),
      this.translate.instant('common.delete'));
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
