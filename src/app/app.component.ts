import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { AuditService } from './shared/services/audit.service';
import { AlertComponent } from './shared/components/alerts/alert/alert.component';
import { LoadingComponent } from './shared/components/alerts/loading/loading.component';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonApp, IonRouterOutlet, AlertComponent, LoadingComponent],
})
export class AppComponent {
  private auditService = inject(AuditService);

  constructor() {
    this.auditService.startNavigationTracking();
  }
}