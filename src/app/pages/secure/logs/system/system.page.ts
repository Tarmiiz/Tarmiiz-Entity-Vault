import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { MyPage } from '../my/my.page';

@Component({
  selector: 'app-logs-system',
  templateUrl: './system.page.html',
  styleUrls: ['./system.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, HeaderComponent]
})
export class SystemPage extends MyPage {
  protected override fetch(page?: number, pageSize?: number) {
    return this.apiService.auditSystem(this.buildFilters(page, pageSize));
  }

  protected override exportName(): string { return 'audit_system'; }
  protected override exportTitle(): string { return 'System Audit Activity'; }
  protected override pageTitle(): string { return 'System Activity'; }
}
