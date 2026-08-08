import { Injectable, inject } from '@angular/core';
import { FeaturesService } from './features.service';

@Injectable({ providedIn: 'root' })
export class UtilsService {
  // Money precision is server-owned (app_config CURRENCY_DECIMALS).
  private features = inject(FeaturesService);

  formatDate(timestamp: number): string {
    if (!timestamp) return '-';
    const d = new Date(timestamp * 1000);
    const dd   = String(d.getDate()).padStart(2, '0');
    const MM   = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const HH   = String(d.getHours()).padStart(2, '0');
    const mm   = String(d.getMinutes()).padStart(2, '0');
    const ss   = String(d.getSeconds()).padStart(2, '0');
    return `${dd}/${MM}/${yyyy} ${HH}:${mm}:${ss}`;
  }

  // Log/audit rows carry a single canonical `time` (ms) computed API-side
  // (chain_time seconds → ms, else the ms created_at). Format it with a plain
  // `new Date(ms)` — NO ×1000 (that's `formatDate`'s job for raw on-chain seconds).
  formatTime(ms: number | null | undefined): string {
    if (!ms) return '-';
    const d = new Date(ms);
    const dd   = String(d.getDate()).padStart(2, '0');
    const MM   = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const HH   = String(d.getHours()).padStart(2, '0');
    const mm   = String(d.getMinutes()).padStart(2, '0');
    const ss   = String(d.getSeconds()).padStart(2, '0');
    return `${dd}/${MM}/${yyyy} ${HH}:${mm}:${ss}`;
  }

  // Unified timestamp formatter → 'yyyy-MM-dd HH:mm:ss' (24h, local). The one date
  // format used across the app. Auto-detects the unit: values below 1e12 are treated
  // as on-chain SECONDS (×1000), otherwise as millisecond epochs — so it accepts both
  // `chain_time` (seconds) and `created_at` (ms) without the caller normalizing.
  formatTs(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '-';
    let n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '-';
    if (n < 1e12) n *= 1000;
    const d = new Date(n);
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
  }

  formatTokens(value: number): string {
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  // The MONEY formatter — screen (via MoneyPipe) and PDF exports both land here, so the
  // admin's `CURRENCY_DECIMALS` governs every rendered currency figure. NOT for token
  // quantities (`formatTokens`) or percentages.
  formatPrice(value: number): string {
    const d = this.features.currencyDecimals();
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  // The Excel counterpart of formatPrice: rounds to the configured precision but stays a
  // NUMBER, so the cell keeps summing and sorting numerically instead of becoming text.
  // Every money field written into an XLSX row goes through this.
  roundMoney(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const f = Math.pow(10, this.features.currencyDecimals());
    return Math.round(n * f) / f;
  }

  // Numeric 6-decimal rounding — kills double-precision dust (e.g. 2.27e-13 from
  // balance × price − cost) in values used for comparisons (P/L color classes) and
  // Excel cells, without hiding any real value >= 0.000001.
  round6(value: number): number {
    return Math.round((Number(value) || 0) * 1e6) / 1e6;
  }

  // Shorten a 0x-prefixed hex string for display: 0xabcdef…1234. Used for
  // wallet addresses, tx hashes, refNos.
  shortAddr(value: string | null | undefined, head = 6, tail = 4): string {
    if (!value) return '-';
    const s = String(value);
    if (!s.startsWith('0x')) return s;
    if (s.length <= head + tail + 2) return s;
    return s.slice(0, 2 + head) + '…' + s.slice(-tail);
  }

  // Mask an IP address so the casual viewer sees only the first + last segment.
  // IPv4: 192.168.1.42 → 192.xxx.xxx.42 ; IPv6: 2001:db8:…:7334 → 2001:xxxx:…:7334
  maskIp(ip: string | null | undefined): string {
    if (!ip) return '—';
    const trimmed = String(ip).trim();
    if (!trimmed || trimmed === '::1' || trimmed === '127.0.0.1') return '—';
    const v4 = trimmed.match(/(\d{1,3})\.\d{1,3}\.\d{1,3}\.(\d{1,3})$/);
    if (v4) return `${v4[1]}.xxx.xxx.${v4[2]}`;
    if (trimmed.includes(':')) {
      const expanded = trimmed.includes('::')
        ? (() => {
            const [head, tail] = trimmed.split('::');
            const headParts = head ? head.split(':') : [];
            const tailParts = tail ? tail.split(':') : [];
            const fill = 8 - headParts.length - tailParts.length;
            return [...headParts, ...Array(fill).fill('0'), ...tailParts];
          })()
        : trimmed.split(':');
      if (expanded.length === 8) return `${expanded[0]}:xxxx:…:${expanded[7]}`;
    }
    return trimmed;
  }

}
