import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

export interface IntervalOption { value: string; label: string; }

export const ANALYTICS_INTERVALS: IntervalOption[] = [
  { value: '1h',  label: 'analytics.intervalSelect.options.hour1'  },
  { value: '6h',  label: 'analytics.intervalSelect.options.hours6' },
  { value: '1d',  label: 'analytics.intervalSelect.options.day1'   },
  { value: '7d',  label: 'analytics.intervalSelect.options.days7'  },
  { value: '30d', label: 'analytics.intervalSelect.options.days30' },
  { value: '90d', label: 'analytics.intervalSelect.options.days90' },
];

@Component({
  selector: 'app-analytics-interval-select',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="inline-flex items-center gap-2 text-sm text-gray-700">
      <span class="font-medium">{{ 'analytics.intervalSelect.label' | translate }}</span>
      <select
        class="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        [ngModel]="value"
        (ngModelChange)="onChange($event)">
        @for (opt of options; track opt.value) {
          <option [value]="opt.value">{{ opt.label | translate }}</option>
        }
      </select>
    </label>
  `,
})
export class AnalyticsIntervalSelectComponent {
  @Input() value: string = '1d';
  @Input() options: IntervalOption[] = ANALYTICS_INTERVALS;
  @Output() valueChange = new EventEmitter<string>();

  onChange(v: string) { this.valueChange.emit(v); }
}
