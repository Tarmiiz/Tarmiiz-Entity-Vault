import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UtilsService {

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

  formatTokens(value: number): string {
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  formatPrice(value: number): string {
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
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
