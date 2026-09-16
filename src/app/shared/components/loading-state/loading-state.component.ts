import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The platform-standard loading / empty / error wrapper for a PANE, card or tab
 * body (frontend Standard 3.4).
 *
 * Usage — the real content is PROJECTED, so a page cannot ship only two of the
 * three states:
 *   <app-loading-state [loading]="loading()" [empty]="!rows().length"
 *                      [error]="loadError()" emptyKey="custody.assets.empty"
 *                      (retry)="load()">
 *     <table class="table-v4 w-full text-sm text-left">…</table>
 *   </app-loading-state>
 *
 * Branch order is error → loading → empty → content.
 *
 * WHY THREE STATES AND NOT TWO. The two dashboards were full of
 * `@if (loading()) { Loading… } @else { No records }`, which prints "nothing
 * here" whenever the load FAILED — so a regulator cannot tell a quiet market
 * from a broken connection, and an issuer cannot tell a finished filing from
 * one the system never checked. Neither will know to look again. Making the
 * third state part of the component's shape is the only way that stops
 * recurring: a caller who has no error signal leaves `error` unbound and gets
 * today's behaviour, but the state exists and is one binding away.
 *
 * WHICH LOADER GOES WHERE — the tier is decided by what is loading, not by
 * taste (Standard 3.4):
 *   · a blocking write          → the 72px brand mark in the global overlay
 *                                 (LoadingService), never this component
 *   · a pane / card / tab body  → THIS component (the 44px brand mark)
 *   · a table BODY              → 5 skeleton rows, inline in the <tbody>.
 *     A skeleton shows the column shape; a spinner hides it. Do NOT wrap a
 *     table's rows in this component to get the mark — wrap the whole card if
 *     the card is what is being replaced, otherwise use skeleton rows.
 *   · inside a control          → a small circle spinner; the brand mark is
 *                                 illegible below ~40px
 *
 * ⚠️ BYTE-IDENTICAL IN THE ENTITY VAULT AND THE REGULATOR DASHBOARD, and
 * rendered at `Tarmiiz Design Components/v4/components.html`.
 */
@Component({
  selector: 'app-loading-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    @if (error) {
      <div class="px-6 py-10 flex flex-col items-center justify-center text-center">
        <span class="w-9 h-9 rounded-[11px] flex items-center justify-center bg-red-50 text-red-600 mb-3">
          <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>
          </svg>
        </span>
        <p class="text-sm text-gray-700">{{ error }}</p>
        @if (retry.observed) {
          <button type="button" (click)="retry.emit()"
            class="mt-3 text-xs px-3 py-1.5 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors">
            {{ 'common.retry' | translate }}
          </button>
        }
      </div>
    } @else if (loading) {
      <div class="px-6 py-10 flex flex-col items-center justify-center">
        <!-- Decorative: the status is carried by the label, so the mark is
             aria-hidden and the text is what a screen reader announces.
             --tz-size is the ONLY thing that differs from the 72px overlay —
             every offset in the lattice is a fraction of it. -->
        <div class="tz-mark" [style.--tz-size.px]="size" aria-hidden="true">
          <i class="tz-b1"></i><i class="tz-b2"></i><i class="tz-b3"></i>
          <i class="tz-b4"></i><i class="tz-b5"></i><i class="tz-b6"></i>
        </div>
        <p class="mt-3 text-sm text-gray-500" role="status">{{ loadingKey | translate }}</p>
      </div>
    } @else if (empty) {
      <div class="px-6 py-10 text-center">
        <p class="text-sm text-gray-500">{{ emptyKey | translate }}</p>
      </div>
    } @else {
      <ng-content></ng-content>
    }
  `,
})
export class LoadingStateComponent {
  /** A fetch is in flight. Shows the brand mark. */
  @Input() loading = false;

  /**
   * The fetch finished and returned nothing. Shows `emptyKey`.
   * MUST be false while `loading` is true — otherwise the branch order saves
   * you, but the caller's own reasoning is wrong somewhere upstream.
   */
  @Input() empty = false;

  /**
   * The fetch FAILED — a human-readable message, already localized. Truthy wins
   * over both other states, because "we could not read this" outranks both
   * "still reading" and "there is nothing".
   *
   * Leave unbound where a page has no error signal yet. That keeps today's
   * two-state behaviour rather than forcing error handling to be invented page
   * by page; the upgrade is then one binding, on one component.
   */
  @Input() error: string | null = null;

  /** i18n key for the empty state. Name what is absent — never a bare "No data". */
  @Input() emptyKey = 'common.noData';

  /** i18n key for the loading label. */
  @Input() loadingKey = 'common.loading';

  /**
   * Brand-mark size in px. 44 is the pane default; the global overlay uses 72.
   * ⚠️ Do not drop below ~40 — each block is then under 3px and the glyph reads
   * as noise. Use a small circle spinner inside a control instead.
   */
  @Input() size = 44;

  /**
   * Bind this to offer a Retry button in the error state. When nothing is
   * bound, `retry.observed` is false and no button renders — a Retry that does
   * nothing is worse than none, because it tells the operator the failure is
   * recoverable.
   */
  @Output() retry = new EventEmitter<void>();
}
