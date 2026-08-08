import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The platform-standard Refresh control (frontend Standard 3.6).
 *
 * ONE look for every "re-read this data" action: a secondary (ghost) button with the
 * two-arrow refresh glyph + the localized "Refresh" label. Never a text link, never a
 * primary filled button — refresh is always secondary to the page's real actions.
 *
 * Usage:
 *   <app-refresh-button [loading]="loading()" (refresh)="load()" />
 *   <app-refresh-button [dark]="true" (refresh)="load()" />   <!-- on a colored banner -->
 *
 * While `loading` is true the icon spins and the button is disabled; the LABEL does not
 * change (a "Loading…" swap resizes the button mid-click and shifts the row).
 */
@Component({
  selector: 'app-refresh-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <button type="button" (click)="refresh.emit()" [disabled]="loading || disabled"
      [title]="'common.refresh' | translate"
      [class]="dark ? darkClasses : defaultClasses">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" [class.animate-spin]="loading"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      @if (!iconOnly) {
        <span>{{ 'common.refresh' | translate }}</span>
      }
    </button>
  `,
})
export class RefreshButtonComponent {
  /** Spins the icon + disables the button while a fetch is in flight. */
  @Input() loading = false;
  /** Disables the button for reasons other than an in-flight fetch. */
  @Input() disabled = false;
  /** Use on a colored / dark surface (banner headers) where the gray ghost is invisible. */
  @Input() dark = false;
  /** Icon only — for tight rows where the label doesn't fit. */
  @Input() iconOnly = false;

  @Output() refresh = new EventEmitter<void>();

  readonly defaultClasses =
    'text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed';
  readonly darkClasses =
    'text-xs px-3 py-1.5 rounded border border-white/30 text-white/90 hover:bg-white/10 transition-colors inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed';
}
