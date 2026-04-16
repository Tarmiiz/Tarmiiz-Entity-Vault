import { Component, OnInit, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

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
  imports: [CommonModule, HeaderComponent]
})
export class DetailsPage implements OnInit {
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  utils = inject(UtilsService);

  event = signal<AuditLog | null>(null);
  chain = signal<AuditLog[]>([]);
  refNo = signal<string>('');

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    const refNo = this.route.snapshot.queryParamMap.get('refNo') || '';
    this.refNo.set(refNo);
    this.loadingService.show('Loading event...');

    // Resolve the focus event and its refNo chain. If the refNo is provided
    // (either via query string or derived from the fetched event), load the
    // full chain via /audit/ref/:refNo.
    let focusRefNo = refNo;

    if (!this.isZeroRef(focusRefNo)) {
      const data = await this.apiService.auditByRef(focusRefNo);
      if (data) {
        const rows: AuditLog[] = (data.rows || []).map((r: any) => this.mapRow(r));
        this.chain.set(rows);
        const match = rows.find(r => String(r.id) === String(id)) || rows[0] || null;
        this.event.set(match);
      }
    } else if (id) {
      // No refNo in query — try to look up via auditMe paginated; this is a
      // best-effort fallback so the page doesn't appear empty on direct load.
      const data = await this.apiService.auditMe({ pageSize: 500 });
      if (data) {
        const rows: AuditLog[] = (data.rows || []).map((r: any) => this.mapRow(r));
        const match = rows.find(r => String(r.id) === String(id)) || null;
        this.event.set(match);
        if (match && !this.isZeroRef(match.ref_no)) {
          focusRefNo = match.ref_no;
          this.refNo.set(focusRefNo);
          const chainData = await this.apiService.auditByRef(focusRefNo);
          if (chainData) {
            this.chain.set((chainData.rows || []).map((r: any) => this.mapRow(r)));
          }
        }
      }
    }

    this.loadingService.hide();
  }

  back() { this.location.back(); }

  isZeroRef(refNo: string): boolean {
    return !refNo || /^0x0+$/i.test(refNo);
  }

  shortAddr(addr: string): string {
    if (!addr) return '';
    if (addr.length <= 12) return addr;
    return addr.slice(0, 6) + '…' + addr.slice(-4);
  }

  prettyJson(raw: string): string {
    if (!raw) return '';
    try { return JSON.stringify(JSON.parse(raw), null, 2); }
    catch { return raw; }
  }

  private mapRow(r: any): AuditLog {
    // Tolerate either snake_case or camelCase in the API payload — the backend
    // emits both, but older builds / partial responses may only carry one.
    const pick = (...keys: string[]): any => {
      for (const k of keys) if (r?.[k] !== undefined && r?.[k] !== null) return r[k];
      return undefined;
    };
    const rawExtras = pick('extras');
    return new AuditLog(
      pick('id') ?? 0,
      pick('category') ?? '',
      pick('action') ?? '',
      pick('actor_address', 'actorAddress') ?? '',
      pick('actor_user_id', 'actorUserId') ?? null,
      pick('actor_user_name', 'actorUserName') ?? '',
      pick('target_address', 'targetAddress') ?? '',
      pick('target_kind', 'targetKind') ?? '',
      pick('subject_id', 'subjectId') ?? '',
      pick('ref_no', 'refNo') ?? '',
      pick('before_state', 'beforeState') ?? '',
      pick('after_state', 'afterState') ?? '',
      pick('reason') ?? '',
      typeof rawExtras === 'string' ? rawExtras : JSON.stringify(rawExtras ?? {}),
      pick('visibility') ?? 0,
      pick('encrypted') ?? 0,
      pick('tx_hash', 'txHash') ?? '',
      pick('block_number', 'blockNumber') ?? 0,
      pick('log_index', 'logIndex') ?? 0,
      pick('chain_time', 'chainTime') ?? 0,
      pick('client_ip', 'clientIp') ?? '',
      pick('created_at', 'createdAt') ?? 0,
    );
  }
}
