import { Component, Input, OnChanges, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { LiveStatusService } from '../../services/live-status.service';

/**
 * Live / Refreshing data indicator — now a REPORTER, not a renderer.
 *
 * It USED to draw the badge in place: `bar=true` rendered its own thin grey
 * sub-bar under the page header, `bar=false` an inline badge inside a breadcrumb
 * row. With the v4 shell the badge shows ONCE, in the global top bar, so this
 * component renders nothing and forwards its state to LiveStatusService, which
 * AuthorizedLayoutComponent displays.
 *
 * ⚠️ IT STAYS IN ALL 22 PAGE TEMPLATES, UNCHANGED. `[refreshing]` and `[bar]`
 * keep working exactly as before — `bar` is now accepted and ignored. That is the
 * point: moving the badge cost zero page edits, and a page that later wants its
 * own inline indicator back only has to change this file. Do not "clean up" by
 * deleting the tag from pages; the input is how the bar learns a page is live.
 */
@Component({
  selector: 'app-live-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class LiveIndicatorComponent implements OnChanges, OnDestroy {
  @Input() refreshing = false;

  /** Retained for template compatibility across all 22 call sites; unused. */
  @Input() bar = true;

  private readonly live = inject(LiveStatusService);
  /** Per-INSTANCE key — several pages are alive at once under Ionic's retained
      router outlet, so a shared flag would be written in undefined order. */
  private readonly key = Symbol('live-indicator');

  ngOnChanges(): void {
    this.live.report(this.key, this.refreshing);
  }

  ngOnDestroy(): void {
    this.live.release(this.key);
  }
}
