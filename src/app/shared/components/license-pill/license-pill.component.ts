import { ChangeDetectionStrategy, Component, Input, computed } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** The `license` block every admin-surface row now carries (see Entity API licenseSurfacing.js). */
export interface LicenseStatus {
  state: 'available' | 'not-covered' | 'undetermined' | 'retired' | 'frontend-only' | 'core' | 'unknown';
  sections: string[];
  covered: number;
  total: number;
  note: string;
}

/**
 * What this tenant's LICENSES mean for one admin row — one look, one wording, every screen.
 *
 * ─── 🔴 THE RULE THIS COMPONENT EXISTS TO GET RIGHT ──────────────────────────────────────────
 * **The license ceiling gates ROUTES, not KEYS.** A system function spanning six sections has its
 * routes spread across them, and a route in an unlocked section still works. So a key is only
 * "not covered" when EVERY section it touches is closed; PARTIAL coverage is available, and the
 * split is shown.
 *
 * ⚠️ Rendering the partial case as blocked — or as "requires any of X, Y, Z" — tells an admin that
 * one threshold decides the key, when each route decides itself. An admin who believes a live key
 * is already dead will DISABLE it, taking the surfaces it still governs with it. That is a wrong
 * answer that ACTS, not one that merely misinforms.
 *
 * ─── FOUR ABSENCES, FOUR DIFFERENT SENTENCES ─────────────────────────────────────────────────
 * ⚠️ Collapsing these into one em-dash is the failure — each sends an admin somewhere different:
 *   core          deliberately outside licensing. Always works. Renders as nothing at all.
 *   retired       the route is GONE. Says nothing about licenses, because no license brings it
 *                 back; the key survives only so stored overrides are not orphaned.
 *   undetermined  we could not READ the license set — chase the chain or the sync, NOT the
 *                 regulator. Same refusal as not-covered, opposite remedy.
 *   unknown       we have no mapping. Say so; never render an unknown as "unrestricted".
 *
 * ⚠️ WORDING: "your licenses do not cover this", never "blocked". The ceiling is not deployed to
 * the running tenants yet, so a row claiming to be blocked would be describing something that is
 * not happening.
 *
 * Usage:  <app-license-pill [license]="row.license" />
 */
@Component({
  selector: 'app-license-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    @if (visible()) {
      <span class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap"
            [class]="classes()" [title]="tooltip()">
        {{ label() | translate }}
        @if (showSplit()) {
          <span class="opacity-75">{{ license?.covered }}/{{ license?.total }}</span>
        }
      </span>
    }
  `,
})
export class LicensePillComponent {
  // Accepts undefined as well as null, deliberately. Rows reach this from several mappers and an
  // absent field is undefined, not null — forcing every call site to coerce would put the same
  // "?? null" in a dozen templates and one of them would eventually be missed. Both mean the same
  // thing here: no license information, so render nothing.
  //
  // NOTE this comment was written twice: the first attempt went through an unquoted shell heredoc
  // and the backticks around the type names were executed as command substitution, deleting the
  // words they wrapped. The file still compiled. Prose is the one thing a build cannot check.
  @Input() license: LicenseStatus | null | undefined = null;

  /**
   * CORE renders nothing. A pill on every core row is noise that trains admins to ignore the pill,
   * which is precisely the row where it matters.
   */
  visible = computed(() => {
    const s = this.license?.state;
    return !!s && s !== 'core';
  });

  /** Only the partially-covered case has a split worth showing. */
  showSplit = computed(() =>
    this.license?.state === 'available' && (this.license?.total ?? 0) > 1
    && (this.license?.covered ?? 0) < (this.license?.total ?? 0));

  label = computed(() => {
    switch (this.license?.state) {
      case 'not-covered':   return 'license.notCovered';
      case 'undetermined':  return 'license.undetermined';
      case 'retired':       return 'license.retired';
      case 'frontend-only': return 'license.frontendOnly';
      case 'unknown':       return 'license.unknown';
      default:              return 'license.covered';
    }
  });

  classes = computed(() => {
    switch (this.license?.state) {
      // Amber, not red: the tenant is not misconfigured and nothing is broken — a license it does
      // not hold is a normal state, and red would read as an error to fix here rather than a
      // permission to obtain from the regulator.
      case 'not-covered':   return 'bg-amber-50 border-amber-200 text-amber-700';
      // Gray. An unavailable READ is not a verdict about the tenant.
      case 'undetermined':  return 'bg-gray-50 border-gray-200 text-gray-500';
      case 'retired':       return 'bg-gray-50 border-gray-200 text-gray-500';
      case 'frontend-only': return 'bg-gray-50 border-gray-200 text-gray-500';
      case 'unknown':       return 'bg-gray-50 border-gray-200 text-gray-500';
      default:              return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    }
  });

  /** The detail belongs in a tooltip: the pill must stay one short phrase in a dense table. */
  tooltip = computed(() => {
    const l = this.license;
    if (!l) return '';
    if (l.state === 'retired' || l.state === 'frontend-only') return l.note || '';
    if (l.state === 'undetermined') return 'This tenant\'s licenses could not be read, so this is not a decision about your permissions.';
    if (!l.sections?.length) return '';
    const which = l.sections.join(', ');
    if (l.state === 'not-covered') return `Your licenses do not cover ${which}.`;
    if (l.covered < l.total) return `Covers ${which} — your licenses cover ${l.covered} of ${l.total}.`;
    return `Covers ${which}.`;
  });
}
