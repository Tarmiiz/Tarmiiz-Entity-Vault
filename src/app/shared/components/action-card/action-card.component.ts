import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The side ACTION CARD for a detail pane (frontend Standard 2.2, v4).
 *
 * Usage:
 *   <div class="flex flex-col lg:flex-row gap-4 items-start max-w-6xl mx-auto">
 *     <div class="card-v4 flex-1 min-w-0 w-full"> …field grid… </div>
 *     <app-action-card>
 *       <button appAction="primary" (click)="edit()">{{ 'x.edit' | translate }}</button>
 *       <button appAction (click)="credentials()">…</button>
 *       <button appAction="danger" (click)="changeState()">…</button>
 *     </app-action-card>
 *   </div>
 *
 * WHEN — a pane that is a SHORT FIELD GRID carrying TWO OR MORE record-level
 * actions. That is where a bottom button row goes wrong: the row sits below
 * every field, so the actions are the last thing on the page, and it lays out
 * horizontally, so five of them wrap into a strip of equal-weight chips that
 * reads as no hierarchy at all (the User Details page shipped FIVE colours in
 * one row — Phase 35 B2 / S6 / B4). A vertical list beside the record is one
 * glance, with exactly one filled (primary) button and the rest outlined.
 *
 * WHEN NOT —
 *   · ONE action: it stays a button in the pane. A card around one row is chrome.
 *   · A FIELD-SCOPED control (rename this handle, assign this group) stays with
 *     its field. The card is for acts on the RECORD; moving a field's own
 *     control away from the field makes the user look in two places.
 *   · Table-heavy panes: the card would sit beside a wide table and squeeze it.
 *
 * TONES — exactly one `primary` per card (the routine act, filled), `danger` for an
 * act that can remove someone's access or a record's standing, everything
 * else the default. Colour is never the safeguard on a destructive act: those
 * still route through AlertService confirm.
 *
 * Every gate the old button carried (role, systemFunctionEnabled, isSelf)
 * moves with it unchanged — the card changes layout, never who may act. If
 * every action is gated away, wrap the card in the same `@if` so an empty
 * "Actions" heading is never rendered.
 *
 * Paint lives in `.action-v4` in `global.scss` and derives from
 * --brand-primary, like `.tab-v4`, so a whitelabelled tenant keeps its colour.
 * Only layout is here.
 *
 * ⚠️ BYTE-IDENTICAL IN THE ENTITY VAULT AND THE REGULATOR DASHBOARD, and
 * rendered in `Tarmiiz Design Components/v4/components.html` → "Action card".
 */
@Component({
  selector: 'app-action-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: { class: 'block w-full lg:w-64 shrink-0 lg:sticky lg:top-4' },
  template: `
    <aside class="card-v4 p-2" [attr.aria-label]="heading | translate">
      <p class="px-3 pt-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{{ heading | translate }}</p>
      <div class="flex flex-col gap-2 px-1 pb-1">
        <ng-content />
      </div>
    </aside>
  `,
})
export class ActionCardComponent {
  /** An i18n KEY, like TabDef.label. */
  @Input() heading = 'common.actions';
}

/**
 * One button of the action card. An ATTRIBUTE component on a real <button>, so
 * `(click)`, `[disabled]` and the page's own gates stay exactly where they
 * were — the component only adds the tone and `type="button"`.
 *
 *   <button appAction>          outlined neutral
 *   <button appAction="primary"> the one routine act — filled brand
 *   <button appAction="danger">  outlined rose, fills on hover — deactivation, revocation
 *
 * They are BUTTONS, deliberately not list rows: a chevron or a link-style row
 * reads as navigation, and every one of these opens a modal that changes the
 * record. (A dot + chevron row was tried first on 2026-09-23 and ruled out.)
 */
@Component({
  selector: 'button[appAction]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    type: 'button',
    class: 'action-v4',
    '[class.is-primary]': "tone === 'primary'",
    '[class.is-danger]': "tone === 'danger'",
  },
  template: `
    <span class="min-w-0 truncate"><ng-content /></span>
  `,
})
export class ActionItemComponent {
  /** `appAction` with no value is the default tone. */
  @Input('appAction') tone: '' | 'default' | 'primary' | 'danger' = '';
}
