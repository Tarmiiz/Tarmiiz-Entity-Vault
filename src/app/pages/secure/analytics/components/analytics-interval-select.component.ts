import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface IntervalOption { value: string; label: string; }

export const ANALYTICS_INTERVALS: IntervalOption[] = [
  { value: '1h',  label: '1 hour'   },
  { value: '6h',  label: '6 hours'  },
  { value: '1d',  label: '1 day'    },
  { value: '7d',  label: '7 days'   },
  { value: '30d', label: '30 days'  },
  { value: '90d', label: '90 days'  },
];

@Component({
  selector: 'app-analytics-interval-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="inline-flex items-center gap-2 text-sm text-gray-700">
      <span class="font-medium">Interval</span>
      <select
        class="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        [ngModel]="value"
        (ngModelChange)="onChange($event)">
        @for (opt of options; track opt.value) {
          <option [value]="opt.value">{{ opt.label }}</option>
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
