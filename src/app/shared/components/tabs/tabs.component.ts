import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * One tab in a tab bar or a sub-tab rail.
 *
 * `label` is normally an i18n KEY. It is piped through `translate`, and
 * ngx-translate returns an unknown key unchanged — so a caller that already
 * holds a resolved string (a dynamic grant-group name, a licence class) can
 * pass it directly without a flag, as long as it does not look like a key.
 *
 * `count` renders a small neutral badge after the label. Leave it `undefined`
 * for no badge; `0` DOES render, because "0 holders" and "we have not counted
 * yet" are different facts and a tab is exactly where that distinction is read.
 *
 * It is `number | string` because a rail item's badge is not always a tally: the
 * Regulator's Permissions rail shows `granted/total` per family, which is the
 * whole reason that rail is scannable — a regulator sees where the gaps are
 * without opening each group. Anything passed as a string is rendered verbatim,
 * so keep it short; it is a badge, not a sentence.
 */
export interface TabDef {
  key: string;
  label: string;
  count?: number | string;

  /**
   * `attention` tints the badge amber. Use it ONLY where the count means "there
   * is something here for you to act on" — a pending-approvals queue, an
   * inbox — never for a plain tally.
   *
   * The distinction is worth a field rather than a caller-supplied class,
   * because it is the one case where a badge is a STATUS and not a quantity.
   * The DEX deals and RFQ pages tinted these by hand before the component
   * existed, and flattening them to neutral would have deleted a real signal
   * (which tab needs you) to satisfy a rule about counts.
   */
  tone?: 'neutral' | 'attention';
}

/**
 * The platform-standard detail-page tab bar (frontend Standard 2, v4).
 *
 * Usage:
 *   <app-tabs [tabs]="TABS" [active]="activeTab()" (select)="setTab($event)" />
 *   <div class="card-v4 p-6"> @if (activeTab() === 'info') { … } </div>
 *
 * The strip and the content are separate `.card-v4` siblings — v1 glued them
 * with `rounded-t-lg` / `rounded-b-lg`. This component renders the strip only.
 *
 * WHY THIS IS A COMPONENT AND NOT A CLASS STRING TO COPY. Before it, the two
 * dashboards carried FIVE tab recipes (Vault) and FOUR (Regulator) across 24
 * files each — two accent colours, two idioms (filled block vs underline) and
 * two signal names. Eleven of those buttons also carried `py-1.5.5`, an invalid
 * Tailwind class that compiles to NOTHING, so they shipped with no vertical
 * padding and a green build. A recipe that has to be re-typed 200 times will
 * diverge; this cannot.
 *
 * Three things it fixes beyond the repaint:
 *   1. The active predicate is evaluated ONCE per tab. The hand-rolled recipe
 *      restated it in four separate `[class.*]` bindings, so the 12-tab asset
 *      page evaluated it 48 times.
 *   2. `overflow-x-auto` on the strip. The old recipe was a bare `flex` with no
 *      overflow handling at all, and the asset detail page puts 12 tabs in it.
 *   3. ARIA + keyboard. None of the ~200 hand-rolled tab buttons had a role.
 *
 * Paint comes from `.tab-v4` in `global.scss`, which derives the active tint
 * from `--brand-primary` — NOT the design catalog's literal indigo, so a
 * whitelabelled tenant keeps its colour. Only layout is inline here.
 *
 * ⚠️ BYTE-IDENTICAL IN THE ENTITY VAULT AND THE REGULATOR DASHBOARD. There is
 * no shared package, so a change belongs in both — and in the rendered
 * reference at `Tarmiiz Design Components/v4/components.html`.
 *
 * On the ARIA: `role=tablist` + `role=tab` + `aria-selected` + a roving
 * tabindex with arrow-key movement is the complete keyboard contract for the
 * STRIP. `aria-controls` / `role=tabpanel` on the content side is optional in
 * WAI-ARIA and is left to the page, since the panel markup lives there. This
 * advances the accessibility review recorded in TODO.md; it does not close it.
 */
@Component({
  selector: 'app-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="card-v4 p-2 mb-4">
      <div class="flex gap-1 overflow-x-auto" role="tablist" (keydown)="onKeydown($event)">
        @for (tab of tabs; track tab.key) {
          <button type="button" role="tab"
            [attr.aria-selected]="tab.key === active"
            [tabindex]="tab.key === active ? 0 : -1"
            (click)="select.emit(tab.key)"
            class="tab-v4 shrink-0 px-4 py-1.5 inline-flex items-center whitespace-nowrap"
            [class.is-active]="tab.key === active">
            {{ tab.label | translate }}
            @if (tab.count !== undefined) {
              <span class="tab-v4-badge" [class.is-attention]="tab.tone === 'attention'">{{ tab.count }}</span>
            }
          </button>
        }
      </div>
    </div>
  `,
})
export class TabsComponent {
  @Input() tabs: TabDef[] = [];
  @Input() active = '';

  @Output() select = new EventEmitter<string>();

  /**
   * Arrow-key movement across the strip, which is what makes `role=tablist`
   * honest rather than decorative. Home/End jump to the ends.
   *
   * ⚠️ Direction is resolved against the document's writing mode, not
   * hardcoded: under `[dir=rtl]` the visually-left arrow must move to the NEXT
   * tab, and a hardcoded mapping sends Arabic users backwards. Movement does
   * not wrap — a tablist that loops makes "am I at the end" unanswerable
   * without counting.
   */
  onKeydown(ev: KeyboardEvent): void {
    const keys = this.tabs.map(t => t.key);
    const at = keys.indexOf(this.active);
    if (at < 0 || !keys.length) return;

    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    let next: number;

    switch (ev.key) {
      case 'ArrowRight': next = rtl ? at - 1 : at + 1; break;
      case 'ArrowLeft':  next = rtl ? at + 1 : at - 1; break;
      case 'Home':       next = 0; break;
      case 'End':        next = keys.length - 1; break;
      default: return;
    }

    if (next < 0 || next >= keys.length) return;
    ev.preventDefault();
    this.select.emit(keys[next]);
  }
}
