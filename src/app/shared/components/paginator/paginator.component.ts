import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

/** Slice an array for the current page, clamping the page into range. */
export function pageSlice<T>(items: T[], page: number, size: number): T[] {
  const maxPage = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), maxPage);
  return items.slice((p - 1) * size, p * size);
}

/**
 * The platform-standard table pagination footer (frontend Standard 1.5).
 *
 * ONE footer for every list table: `Rows [25 v]  1–25 of 41` on the left,
 * `« ‹ Page 1 / 2 › »` on the right. It REPLACES the old "Showing X of Total Y
 * Records" count line — the range label already carries both numbers. The count
 * line survives only on summary/preview tables, which never paginate.
 *
 * Purely presentational: the parent owns `page` / `pageSize` and slices its own
 * data (client-side lists use the exported `pageSlice()` helper; server-paged
 * lists refetch). Pages are 1-BASED everywhere — never bind `page() + 1`.
 *
 * Usage:
 *   <app-paginator [total]="filtered().length" [page]="page()" [pageSize]="pageSize()"
 *     (pageChange)="page.set($event)" (pageSizeChange)="pageSize.set($event)" />
 *
 * A page-size change emits `pageChange(1)` as well, so a consumer cannot strand
 * itself on a page that no longer exists. Filter changes must still reset the
 * page themselves — the component cannot see them.
 */
@Component({
  selector: 'app-paginator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t">
      <div class="flex items-center gap-2 text-xs text-gray-700">
        <span>{{ 'common.rows' | translate }}</span>
        <select [ngModel]="pageSize" (ngModelChange)="onSize(+$event)"
          class="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400">
          @for (s of sizes; track s) { <option [value]="s">{{ s }}</option> }
        </select>
        <span class="font-medium">{{ 'common.rowRange' | translate: { from: total === 0 ? 0 : rangeStart, to: rangeEnd, total: total } }}</span>
      </div>
      <div class="flex items-center gap-1">
        <button type="button" (click)="go(1)" [disabled]="clamped <= 1"
          [title]="'common.first' | translate" [class]="btnClasses"><span class="inline-block rtl:-scale-x-100">&laquo;</span></button>
        <button type="button" (click)="go(clamped - 1)" [disabled]="clamped <= 1"
          [title]="'common.prev' | translate" [class]="btnClasses"><span class="inline-block rtl:-scale-x-100">&lsaquo;</span></button>
        <span class="text-xs px-2 text-gray-700">{{ 'common.pageIndicator' | translate: { page: clamped, pages: totalPages } }}</span>
        <button type="button" (click)="go(clamped + 1)" [disabled]="clamped >= totalPages"
          [title]="'common.next' | translate" [class]="btnClasses"><span class="inline-block rtl:-scale-x-100">&rsaquo;</span></button>
        <button type="button" (click)="go(totalPages)" [disabled]="clamped >= totalPages"
          [title]="'common.last' | translate" [class]="btnClasses"><span class="inline-block rtl:-scale-x-100">&raquo;</span></button>
      </div>
    </div>
  `,
})
export class PaginatorComponent {
  /** Total rows AFTER filtering — never the unfiltered set. */
  @Input() total = 0;
  /** Current page, 1-based. */
  @Input() page = 1;
  @Input() pageSize = 25;

  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  readonly sizes = [10, 25, 50, 100];

  readonly btnClasses =
    'text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  get totalPages(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get clamped(): number { return Math.min(Math.max(1, this.page), this.totalPages); }
  get rangeStart(): number { return (this.clamped - 1) * this.pageSize + 1; }
  get rangeEnd(): number { return Math.min(this.clamped * this.pageSize, this.total); }

  go(p: number): void {
    const next = Math.min(Math.max(1, p), this.totalPages);
    if (next !== this.page) this.pageChange.emit(next);
  }

  /** Size changes always return to page 1 — the old page may no longer exist. */
  onSize(size: number): void {
    this.pageSizeChange.emit(size);
    if (this.page !== 1) this.pageChange.emit(1);
  }
}
