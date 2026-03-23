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

}
