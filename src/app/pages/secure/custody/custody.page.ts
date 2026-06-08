import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { HeaderComponent } from '../../../shared/components/header/header.component';
import { ApiService } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';
import { Service, User } from '../../../shared/models/data.model';

@Component({
  selector: 'app-custody',
  templateUrl: './custody.page.html',
  styleUrls: ['./custody.page.scss'],
  standalone: true,
  imports: [CommonModule, HeaderComponent, TranslatePipe],
})
export class CustodyPage implements OnInit {
  private apiService     = inject(ApiService);
  private authService    = inject(AuthService);
  private loadingService = inject(LoadingService);
  private router         = inject(Router);

  userInfo!: User;

  // The entity's own type-2 (custodian-eligible) services.
  myCustodianServices = signal<Service[]>([]);

  // Reverse index ("services under my custody") needs an Entity API reverse lookup that
  // doesn't exist yet — rendered as a labelled placeholder (parity with the old Service
  // Dashboard custody page). Follow-up: a sync-layer reverse index served from the API.
  servicesUnderCustody = signal<{ service: Service; custodian: Service }[]>([]);

  loaded = signal(false);

  private readonly stateNames: Record<number, string> = {
    0: 'Inactive', 1: 'Initiated', 2: 'Active', 3: 'Suspended', 4: 'Deactivated',
  };

  ngOnInit() {}

  async ionViewWillEnter() {
    this.userInfo = this.authService.userInfo;
    await this.loadOwnCustodianServices();
    this.loaded.set(true);
  }

  private mapService(raw: any): Service {
    return {
      address: raw.address,
      entity: raw.entity ?? '',
      name: raw.name,
      serviceType: raw.service_type ?? 0,
      state: raw.state ?? 0,
      stateName: raw.state_name ?? this.stateNames[raw.state] ?? String(raw.state ?? ''),
      suspended: raw.suspended === true || raw.suspended === 1,
    } as Service;
  }

  private async loadOwnCustodianServices() {
    this.loadingService.show('Loading data...');
    try {
      const list = await this.apiService.vaultGetServicesOwn(0, 500);
      const all: Service[] = Array.isArray(list?.services) ? list!.services.map((s: any) => this.mapService(s)) : [];
      this.myCustodianServices.set(all.filter(s => Number(s.serviceType) === 2));
    } finally {
      this.loadingService.hide();
    }
  }

  getStateClass(stateId: number | undefined): string {
    switch (stateId) {
      case 1: return 'bg-yellow-100 text-yellow-800';
      case 2: return 'bg-green-100 text-green-800';
      case 3: return 'bg-orange-100 text-orange-800';
      case 4: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  gotoService(addr: string) {
    this.router.navigate(['/authorized/services/details/' + addr]);
  }
}
