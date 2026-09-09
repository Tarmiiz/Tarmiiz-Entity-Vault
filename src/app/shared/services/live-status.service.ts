import { Injectable, computed, signal } from '@angular/core';

/**
 * Shared "Live / Refreshing" status for the global top bar.
 *
 * WHY A SERVICE: the indicator used to render inside each page, reading that
 * page's own `refreshing()` signal. The v4 shell shows it once, in the top bar —
 * which lives in AuthorizedLayoutComponent and has no access to a page's signal.
 * So `app-live-indicator` stopped rendering and became a REPORTER: it still sits
 * in all 22 page templates, unchanged, and forwards its input here. That is what
 * kept this from being a 22-file change.
 *
 * ⚠️ REPORTERS ARE KEYED, NOT COUNTED, AND THAT IS DELIBERATE.
 * Ionic's router outlet RETAINS visited pages, so several indicator instances are
 * alive at once — the same fan-out that caused the 2026-09-08 request storm. A
 * single shared boolean would be written by every retained page in undefined
 * order, so the badge would flicker with whichever one last ran change detection.
 * Each instance owns a key instead and the aggregate is "is ANY live reporter
 * refreshing", which is true regardless of ordering. A retained page that is
 * genuinely mid-refresh therefore still counts — which is correct, not a leak.
 */
@Injectable({ providedIn: 'root' })
export class LiveStatusService {
  private readonly reporters = signal<ReadonlyMap<symbol, boolean>>(new Map());

  /** True while any live page is fetching. */
  readonly refreshing = computed(() => {
    for (const v of this.reporters().values()) if (v) return true;
    return false;
  });

  /** True once any page has declared itself live — the bar hides the badge otherwise. */
  readonly present = computed(() => this.reporters().size > 0);

  report(key: symbol, refreshing: boolean): void {
    const cur = this.reporters();
    if (cur.get(key) === refreshing) return;   // no-op keeps change detection quiet
    const next = new Map(cur);
    next.set(key, refreshing);
    this.reporters.set(next);
  }

  release(key: symbol): void {
    const cur = this.reporters();
    if (!cur.has(key)) return;
    const next = new Map(cur);
    next.delete(key);
    this.reporters.set(next);
  }
}
