import { Component, OnInit, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AuditLog } from '../../../../shared/models/data.model';

@Component({
  selector: 'app-logs-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, HeaderComponent, TranslatePipe]
})
export class DetailsPage implements OnInit {
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  utils = inject(UtilsService);

  event = signal<AuditLog | null>(null);
  chain = signal<AuditLog[]>([]);
  refNo = signal<string>('');
  activeTab = signal<'info' | 'chain'>('info');

  setTab(tab: 'info' | 'chain') { this.activeTab.set(tab); }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    const refNo = this.route.snapshot.queryParamMap.get('refNo') || '';
    this.refNo.set(refNo);
    this.loadingService.show('Loading event...');

    let focusEvent: AuditLog | null = null;
    const stateRow = (typeof history !== 'undefined' && history.state && history.state.row)
      ? history.state.row : null;
    if (stateRow && (stateRow instanceof AuditLog || typeof stateRow === 'object')) {
      focusEvent = stateRow instanceof AuditLog ? stateRow : this.mapRow(stateRow);
    }

    // Authoritative fetch by id — also carries the server-computed per-row
    // `verified` tamper check, which list rows don't have. Falls back to the
    // Router-state row (and the feed scans) when it fails.
    if (id) {
      try {
        const byIdData: any = await (this.apiService as any).auditById(id);
        if (byIdData?.row) focusEvent = this.mapRow(byIdData.row);
      } catch { /* fall through */ }

      if (!focusEvent) {
        const meData = await this.apiService.auditMe({ pageSize: 500 });
        focusEvent = (meData?.rows || []).map((r: any) => this.mapRow(r))
          .find((r: AuditLog) => String(r.id) === String(id)) || null;
      }
      if (!focusEvent) {
        try {
          const sysData = await (this.apiService as any).auditSystem({ pageSize: 500 });
          focusEvent = (sysData?.rows || []).map((r: any) => this.mapRow(r))
            .find((r: AuditLog) => String(r.id) === String(id)) || null;
        } catch { /* not admin — ignore */ }
      }
    }
    this.event.set(focusEvent);

    let focusRefNo = refNo;
    if (this.isZeroRef(focusRefNo) && focusEvent && !this.isZeroRef(focusEvent.ref_no)) {
      focusRefNo = focusEvent.ref_no;
      this.refNo.set(focusRefNo);
    }

    if (!this.isZeroRef(focusRefNo)) {
      const data = await this.apiService.auditByRef(focusRefNo);
      if (data) {
        const rows: AuditLog[] = (data.rows || []).map((r: any) => this.mapRow(r));
        this.chain.set(rows);
        if (!focusEvent) {
          const match = rows.find(r => String(r.id) === String(id)) || rows[0] || null;
          this.event.set(match);
        }
      }
    }

    this.loadingService.hide();
  }

  isZeroRef(refNo: string): boolean {
    return !refNo || /^0x0+$/i.test(refNo);
  }

  shortAddr(addr: string | null | undefined, head = 6, tail = 4): string {
    return this.utils.shortAddr(addr, head, tail);
  }

  maskIp(ip: string | null | undefined): string {
    return this.utils.maskIp(ip);
  }

  private mapRow(r: any): AuditLog {
    const pick = (...keys: string[]): any => {
      for (const k of keys) if (r?.[k] !== undefined && r?.[k] !== null) return r[k];
      return undefined;
    };
    return new AuditLog(
      pick('id') ?? 0,
      pick('category') ?? '',
      pick('action') ?? '',
      pick('actor_address', 'actorAddress') ?? '',
      pick('actor_user_id', 'actorUserId') ?? null,
      pick('actor_user_address', 'actorUserAddress') ?? null,
      pick('country_code', 'countryCode') ?? 0,
      pick('function_selector', 'functionSelector') ?? null,
      pick('contract') ?? null,
      pick('ref_no', 'refNo') ?? '',
      pick('tx_hash', 'txHash') ?? '',
      pick('block_number', 'blockNumber') ?? 0,
      pick('log_index', 'logIndex') ?? 0,
      pick('chain_time', 'chainTime') ?? 0,
      pick('client_ip', 'clientIp') ?? null,
      pick('created_at', 'createdAt') ?? 0,
      pick('actor_name', 'actorName') ?? null,
      pick('actor_kind', 'actorKind') ?? null,
      pick('actor_user_name', 'actorUserName') ?? null,
      pick('function_name', 'functionName') ?? null,
      pick('function_signature', 'functionSignature') ?? null,
      pick('contract_name', 'contractName') ?? null,
      pick('contract_kind', 'contractKind') ?? null,
      pick('action_label', 'actionLabel') ?? null,
      pick('prev_hash', 'prevHash') ?? null,
      pick('row_hash', 'rowHash') ?? null,
      pick('verified') ?? null,
    );
  }

  contractLabel(r: AuditLog): string {
    if (r.contract_name) return r.contract_name;
    return this.shortAddr(r.contract);
  }

  actorLabel(r: AuditLog): string {
    if (r.actor_name) {
      return r.actor_kind ? `${r.actor_name} · ${r.actor_kind}` : r.actor_name;
    }
    return r.actor_user_name || this.shortAddr(r.actor_address);
  }

  functionLabel(r: AuditLog): string {
    if (r.function_name) return r.function_name;
    return r.function_selector ? this.shortAddr(r.function_selector) : '—';
  }

  actionLabel(r: AuditLog): string {
    // Persisted drain-time readable label ("Credit – Service Deposit");
    // falls back to the raw decoded action for legacy rows.
    return r.action_label || (r.action || '').replace(/_/g, ' ');
  }

  filterByActor(addr: string | null | undefined) {
    if (!addr) return;
    this.router.navigate(['/authorized/logs/system'], { queryParams: { actor: addr } });
  }

  filterByContract(addr: string | null | undefined) {
    if (!addr) return;
    this.router.navigate(['/authorized/logs/system'], { queryParams: { contract: addr } });
  }
}
