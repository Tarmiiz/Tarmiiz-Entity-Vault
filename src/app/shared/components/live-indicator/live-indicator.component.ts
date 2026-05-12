import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * Live / Refreshing data indicator.
 *
 * Default mode (`bar=true`): renders its own thin gray sub-bar — drop right after `<app-header>`.
 * Inline mode (`bar=false`): renders just the badge — embed inside an existing breadcrumb row.
 */
@Component({
  selector: 'app-live-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (bar) {
      <div class="px-6 py-2 border-b bg-gray-200 flex items-center justify-end">
        <ng-container *ngTemplateOutlet="badge"></ng-container>
      </div>
    } @else {
      <ng-container *ngTemplateOutlet="badge"></ng-container>
    }

    <ng-template #badge>
      <div class="flex items-center gap-2 text-xs"
           [class.text-gray-500]="!refreshing"
           [class.text-orange-600]="refreshing">
        @if (refreshing) {
          <svg class="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
          <span>Refreshing data…</span>
        } @else {
          <svg class="w-3.5 h-3.5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4"></circle>
          </svg>
          <span>Live</span>
        }
      </div>
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
})
export class LiveIndicatorComponent {
  @Input() refreshing = false;
  @Input() bar = true;
}
