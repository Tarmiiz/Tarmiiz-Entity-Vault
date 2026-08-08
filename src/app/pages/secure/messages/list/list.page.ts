import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { LiveIndicatorComponent } from '../../../../shared/components/live-indicator/live-indicator.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { ConnectThread } from '../../../../shared/models/data.model';
import { ModalNewThreadService } from '../modals/modal-new-thread/modal-new-thread.service';
import { PaginatorComponent, pageSlice } from '../../../../shared/components/paginator/paginator.component';

@Component({
  selector: 'app-messages-list',
  templateUrl: './list.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, LiveIndicatorComponent, TranslatePipe, PaginatorComponent],
})
export class ListPage implements OnInit, OnDestroy {
  private apiService     = inject(ApiService);
  private socketService  = inject(SocketService);
  private router         = inject(Router);
  private loadingService = inject(LoadingService);
  private translate = inject(TranslateService);
  private modalNewThread = inject(ModalNewThreadService);
  private authService    = inject(AuthService);
  utils                  = inject(UtilsService);

  // Security officer (role 4) — read-only full-audit view: no compose surface.
  get isReadOnly(): boolean { return Number(this.authService.userInfo?.role) === 4; }

  threads        = signal<ConnectThread[]>([]);
  threadsCount   = 0;
  searchTerm     = signal('');
  searchParticipant = signal('');
  filterType     = signal<'all' | 'entity' | 'regulator' | 'subscription'>('all');
  filterState    = signal<'all' | '1' | '2' | '3'>('all');
  unreadOnly     = signal(false);
  loadingData    = false;
  refreshing     = signal(false);
  entityAddress  = signal('');
  directory      = signal<Record<string, { name: string; partyType: number }>>({});

  private sub?: Subscription;

  async ngOnInit() {
    const cfg = await this.apiService.vaultGetConfig();
    this.entityAddress.set((cfg?.entityContract || '').toLowerCase());

    this.sub = this.socketService.vaultUpdated$.subscribe(p => {
      if (p.type === 'connect' || p.type === 'all') this.loadThreads(true);
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async ionViewDidEnter() {
    this.loadingData = true;
    await this.loadThreads();
    this.loadingData = false;
  }

  async loadThreads(silent = false) {
    if (silent) this.refreshing.set(true);
    if (!silent) this.loadingService.show(this.translate.instant('messages.loadingList'));
    try {
      const result = await this.apiService.connectThreadsList(1, 100);
      if (result?.threads) {
        this.threadsCount = result.count;
        this.threads.set(result.threads);
        this.resolveDirectory(result.threads);
      }
    } finally {
      if (!silent) this.loadingService.hide();
      if (silent) this.refreshing.set(false);
    }
  }

  private async resolveDirectory(threads: ConnectThread[]) {
    const current = { ...this.directory() };
    const addrs = new Set<string>();
    for (const t of threads) {
      if (t.creator) addrs.add(t.creator.toLowerCase());
      for (const p of (t.participants || [])) if (p.address) addrs.add(p.address.toLowerCase());
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

  /** 1-based, per frontend Standard 1.5. */
  threadsPage = signal(1);
  threadsPageSize = signal(25);
  pagedThreads = computed(() => pageSlice(this.filteredThreads(), this.threadsPage(), this.threadsPageSize()));
  filteredThreads = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const partTerm = this.searchParticipant().toLowerCase();
    const type = this.filterType();
    const state = this.filterState();
    const unread = this.unreadOnly();
    const self = this.entityAddress();
    const dir = this.directory();
    return this.threads().filter(t => {
      if (unread && (t.unreadCount || 0) === 0) return false;
      if (state !== 'all' && t.state !== Number(state)) return false;
      if (term) {
        const subjectHit = (t.subject?.toLowerCase() || '').includes(term) || String(t.id).includes(term);
        if (!subjectHit) return false;
      }
      if (partTerm) {
        const a = (t.creator || '').toLowerCase();
        const n = (dir[a]?.name || '').toLowerCase();
        if (!a.includes(partTerm) && !n.includes(partTerm)) return false;
      }
      if (type !== 'all') {
        if (type === 'subscription') {
          if (!(t.subscriptions && t.subscriptions.length > 0)) return false;
        } else {
          const counterparties = (t.participants || []).filter(p => p.address.toLowerCase() !== self);
          const target = type === 'entity' ? 2 : 3;
          if (!counterparties.some(p => p.partyType === target)) return false;
        }
      }
      return true;
    }).sort((a, b) => (b.lastMessageAt || b.createdAt || 0) - (a.lastMessageAt || a.createdAt || 0));
  });

  nameFor(address: string): string {
    if (!address) return '—';
    return this.directory()[address.toLowerCase()]?.name || (address.slice(0, 8) + '…');
  }

  onScopeToggle(event: Event) {
    this.unreadOnly.set((event.target as HTMLInputElement).checked);
  }

  clearFilters() {
    this.unreadOnly.set(false);
    this.searchTerm.set('');
    this.searchParticipant.set('');
    this.filterType.set('all');
    this.filterState.set('all');
    const toggle = document.getElementById('ToggleMessagesUnread') as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
    this.threadsPage.set(1);
  }

  stateName(s: number): string {
    return s === 1 ? 'Open' : s === 2 ? 'Closed' : s === 3 ? 'Archived' : '—';
  }

  stateClass(s: number): string {
    return s === 1 ? 'bg-green-100 text-green-800'
         : s === 2 ? 'bg-gray-200 text-gray-700'
         : 'bg-yellow-100 text-yellow-800';
  }

  viewDetails(t: ConnectThread) {
    this.router.navigate(['/authorized/messages/details/' + t.id]);
  }

  async openNewThread() {
    const res = await this.modalNewThread.show();
    if (res?.threadId) {
      await this.loadThreads();
      this.router.navigate(['/authorized/messages/details/' + res.threadId]);
    }
  }
}
