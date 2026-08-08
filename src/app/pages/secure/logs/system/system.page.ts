import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { MyPage } from '../my/my.page';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';

@Component({
  selector: 'app-logs-system',
  templateUrl: './system.page.html',
  styleUrls: ['./system.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, HeaderComponent, TranslatePipe, PaginatorComponent]
})
export class SystemPage extends MyPage {
  protected override fetch(page?: number, pageSize?: number) {
    return this.apiService.auditSystem(this.buildFilters(page, pageSize));
  }

  protected override exportName(): string { return 'audit_system'; }
  protected override exportTitle(): string { return this.translate.instant('logs.system.exportTitle'); }
  protected override pageTitle(): string { return this.translate.instant('logs.system.pageTitle'); }
}
