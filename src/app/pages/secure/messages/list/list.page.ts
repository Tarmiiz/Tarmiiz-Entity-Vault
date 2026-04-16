import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { SocketService } from '../../../../shared/services/socket.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { ConnectThread } from '../../../../shared/models/data.model';
import { ModalNewThreadService } from '../modals/modal-new-thread/modal-new-thread.service';

@Component({
  selector: 'app-messages-list',
  templateUrl: './list.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
})
export class ListPage implements OnInit, OnDestroy {
  private apiService     = inject(ApiService);
  private socketService  = inject(SocketService);
  private router         = inject(Router);
  private loadingService = inject(LoadingService);
  private modalNewThread = inject(ModalNewThreadService);
  utils                  = inject(UtilsService);

  threads        = signal<ConnectThread[]>([]);
  threadsCount   = 0;
  searchTerm     = signal('');
  filterType     = signal<'all' | 'entity' | 'regulator' | 'subscription'>('all');
  unreadOnly     = signal(false);
  loadingData    = false;

  private sub?: Subscription;

  ngOnInit() {
    this.sub = this.socketService.vaultUpdated$.subscribe(p => {
      if (p.type === 'connect' || p.type === 'all') this.loadThreads();
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async ionViewDidEnter() {
    this.loadingData = true;
    await this.loadThreads();
    this.loadingData = false;
  }

  async loadThreads() {
    this.loadingService.show('Loading messages...');
    const result = await this.apiService.connectThreadsList(1, 100);
    if (result?.threads) {
      this.threadsCount = result.count;
      this.threads.set(result.threads);
    }
    this.loadingService.hide();
  }

  filteredThreads = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const type = this.filterType();
    const unread = this.unreadOnly();
    return this.threads().filter(t => {
      if (unread && t.messageCount === 0) return false;
      if (term && !(t.subject?.toLowerCase().includes(term) || String(t.id).includes(term))) return false;
      if (type !== 'all') {
        if (type === 'subscription') {
          if (!(t.subscriptions && t.subscriptions.length > 0)) return false;
        } else {
          const others = (t.participants || []).filter(p => p.partyType !== 2);
          const target = type === 'entity' ? 2 : 3;
          if (!others.some(p => p.partyType === target)) return false;
        }
      }
      return true;
    });
  });

  onScopeToggle(event: Event) {
    this.unreadOnly.set((event.target as HTMLInputElement).checked);
  }

  clearFilters() {
    this.unreadOnly.set(false);
    this.searchTerm.set('');
    this.filterType.set('all');
    const toggle = document.getElementById('ToggleMessagesUnread') as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
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
