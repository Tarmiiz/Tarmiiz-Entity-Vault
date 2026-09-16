import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TabDef } from '../tabs/tabs.component';

/**
 * The platform-standard sub-tab rail inside a detail tab (frontend Standard
 * 2.1). First shipped on the Entity Vault's asset Compliance tab, 2026-08-31.
 *
 * Usage — the panes are PROJECTED, so the component owns the layout that people
 * get wrong:
 *   <app-sub-tab-rail [tabs]="RAIL" [active]="rail()" (select)="goTo($event)">
 *     @if (rail() === 'info') { … }
 *     @if (rail() === 'declaration') { … }
 *   </app-sub-tab-rail>
 *
 * ⚠️ REACH FOR IT ONLY WHEN ONE TAB CARRIES ≥3 GENUINELY SEPARATE JOBS — a
 * whole workflow with its own state, forms, an embedded surface and a decision.
 * Two sections split by a `border-t` are two sections, not a rail; a rail over
 * them just adds a click. If the tab is a LIST of related records, that is
 * Standard 2's embedded-table rule instead.
 *
 * Rules baked into this component so a caller cannot get them wrong:
 *
 *   · ACTIVE IS THE TOP TAB BAR'S TREATMENT (`.tab-v4.is-active`), so one
 *     visual language says "you are here" at both levels. A rail item never
 *     takes the top bar's `border-b-2`.
 *
 *   · NO DIVIDER between rail and content. `gap-4` separates them — a vertical
 *     rule would have to be flipped for RTL (`ltr:border-r` / `rtl:border-l`)
 *     and buys nothing.
 *
 *   · `grow min-w-0` ON THE CONTENT PANE IS LOAD-BEARING, not decoration:
 *     without `min-w-0` a flex child refuses to shrink below its content, so a
 *     wide table inside a pane pushes the whole PAGE into horizontal scroll
 *     instead of scrolling in its own `overflow-x-auto` container.
 *
 *   · Vertical from `md` up, a horizontal scroller below it.
 *
 * Two rules this component CANNOT enforce, and they are the ones that rot:
 *
 *   · ANYTHING SHARED ACROSS THE PANES GOES ABOVE THE RAIL — the record's state
 *     pill, a rejection reason, the Standard 3.6 Refresh control. State that
 *     governs every pane belongs to the tab, not to one item in it. Put it
 *     before this component, not in a pane.
 *
 *   · THE PANE MUST NOT REPEAT THE RAIL ITEM'S NAME AS A HEADING. The control
 *     that chose the pane is already its label, and a heading immediately
 *     beside it stacks two labels — which on the Regulator's Permissions tab
 *     opened the card with two dark bars, the second reading as a child of the
 *     first. Do NOT "restore the card header for consistency" with plain tabs:
 *     those have no selector beside them, so their heading is the only label.
 *
 * Also worth keeping: a row that reports a problem should link to the pane that
 * fixes it. The rail's whole value is that "what is wrong" and "where to fix
 * it" stop being the same screen — so a `Missing` cell carries a small text
 * button calling `select`, never a bare label that leaves the operator to guess
 * which item to open.
 *
 * And: overlay components (pickers, modals) render at the PAGE component's
 * root, outside the projected content — nested in a pane they can be clipped by
 * its stacking or scroll container.
 *
 * ⚠️ BYTE-IDENTICAL IN THE ENTITY VAULT AND THE REGULATOR DASHBOARD, and
 * rendered at `Tarmiiz Design Components/v4/components.html`.
 */
@Component({
  selector: 'app-sub-tab-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="flex flex-col md:flex-row gap-4">

      <nav class="md:w-52 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0"
        role="tablist" (keydown)="onKeydown($event)">
        @for (tab of tabs; track tab.key) {
          <button type="button" role="tab"
            [attr.aria-selected]="tab.key === active"
            [tabindex]="tab.key === active ? 0 : -1"
            (click)="select.emit(tab.key)"
            class="tab-v4 shrink-0 md:w-full flex items-center justify-between gap-3 ltr:text-left rtl:text-right px-4 py-2.5 whitespace-nowrap"
            [class.is-active]="tab.key === active">
            <span>{{ tab.label | translate }}</span>
            @if (tab.count !== undefined) {
              <span class="text-xs font-normal">{{ tab.count }}</span>
            }
          </button>
        }
        <!-- Anything the caller needs at the FOOT of the rail — e.g. the
             Regulator's "Not shown — licence required" note, which explains the
             groups the rail is hiding and therefore belongs beside the rail
             rather than in a pane. -->
        <ng-content select="[railFoot]"></ng-content>
      </nav>

      <div class="grow min-w-0 space-y-6">
        <ng-content></ng-content>
      </div>
    </div>
  `,
})
export class SubTabRailComponent {
  @Input() tabs: TabDef[] = [];
  @Input() active = '';

  @Output() select = new EventEmitter<string>();

  /**
   * A rail is vertical from `md` up and horizontal below it, so BOTH axes move.
   * Up/Down always follow document order; Left/Right are writing-mode aware, so
   * the arrows still read correctly when the rail is the mobile scroller and
   * the page is RTL. No wrapping — see the note on TabsComponent.
   */
  onKeydown(ev: KeyboardEvent): void {
    const keys = this.tabs.map(t => t.key);
    const at = keys.indexOf(this.active);
    if (at < 0 || !keys.length) return;

    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    let next: number;

    switch (ev.key) {
      case 'ArrowDown':  next = at + 1; break;
      case 'ArrowUp':    next = at - 1; break;
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
