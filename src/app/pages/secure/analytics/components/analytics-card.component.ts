import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-analytics-card',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-xl shadow-md border border-gray-200 bg-white p-5 mb-6">
      <header class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div class="min-w-0">
          <h2 class="text-lg font-semibold text-gray-900">{{ title }}</h2>
          @if (subtitle) {
            <p class="text-sm text-gray-500">{{ subtitle }}</p>
          }
        </div>
        <div class="flex items-center gap-3">
          <ng-content select="[card-actions]"></ng-content>
        </div>
      </header>

      @if (loading) {
        <div class="flex items-center justify-center h-48">
          <svg class="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        </div>
      } @else if (empty) {
        <div class="flex items-center justify-center h-48 text-gray-400 italic text-sm">
          {{ emptyMessage || ('common.noData' | translate) }}
        </div>
      } @else {
        <div class="relative">
          <ng-content></ng-content>
        </div>
      }
    </section>
  `,
})
export class AnalyticsCardComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() loading = false;
  @Input() empty = false;
  @Input() emptyMessage = '';
}
