import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Current page title, for the global top bar.
 *
 * Pages still declare it exactly as before — `<app-header [title]="…">` in all 59
 * templates — but app-header no longer draws it. It reports here and the bar
 * renders it, so the title sits beside the logo instead of in a strip on every
 * page. Zero page edits, same as the Live badge.
 *
 * ⚠️ KEYED BY ROUTE, NOT "LAST REPORTER WINS" — and that is the whole design.
 * Ionic's router outlet RETAINS visited pages, so many app-header instances are
 * alive simultaneously. A plain "newest report wins" works going forward but
 * BREAKS ON BACK-NAVIGATION: returning to a retained page re-runs no lifecycle
 * hook (its `title` input never changed), so nothing re-reports and the bar would
 * keep showing the page you just left. Caching per URL means the answer is
 * already there on revisit and no hook is needed.
 *
 * The alternative — having each header check its own visibility every change
 * detection cycle — was rejected: `offsetParent` forces a layout read, and doing
 * that on every retained page on every cycle is exactly the kind of fan-out that
 * caused the 2026-09-08 request storm.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleService {
  private readonly router = inject(Router);

  /** url (query stripped) → title. Bounded by URLs visited in one session. */
  private readonly byUrl = new Map<string, string>();

  private readonly current = signal<string>('');
  readonly title = this.current.asReadonly();

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.current.set(this.byUrl.get(this.key(e.urlAfterRedirects)) ?? ''));
  }

  /** Called by app-header whenever its title input resolves. */
  register(url: string, title: string): void {
    const k = this.key(url);
    this.byUrl.set(k, title);
    // The header usually reports AFTER NavigationEnd has already fired for this
    // URL, so the subscription above missed it — publish directly when it is the
    // page actually on screen.
    if (this.key(this.router.url) === k && this.current() !== title) this.current.set(title);
  }

  private key(url: string): string {
    return (url || '').split('?')[0].split('#')[0];
  }
}
