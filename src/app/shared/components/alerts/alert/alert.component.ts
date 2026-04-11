import { Component, ChangeDetectionStrategy, inject } from '@angular/core';

import { AlertService } from './alert.service';

@Component({
  selector: 'app-alert',
  templateUrl: './alert.component.html',
  styleUrls: ['./alert.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [],
})
export class AlertComponent {

  alertService = inject(AlertService);

  onConfirm(): void {
    this.alertService.confirm();
  }

  onCancel(): void {
    this.alertService.cancel();
  }

}
