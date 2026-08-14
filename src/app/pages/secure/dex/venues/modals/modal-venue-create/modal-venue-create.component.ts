import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalVenueCreateService } from './modal-venue-create.service';
import { ApiService } from '../../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-venue-create',
  templateUrl: './modal-venue-create.component.html',
  styleUrls: ['./modal-venue-create.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
})
export class ModalVenueCreateComponent {
  modalService = inject(ModalVenueCreateService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  services = signal<any[]>([]);

  form = this.fb.group({
    serviceAddress: ['', Validators.required],
  });

  constructor() {
    this.loadServices();
  }

  async loadServices() {
    const data = await this.apiService.vaultGetServices(0, 1000);
    const list = data?.services ?? [];
    // Type-1 (token issuer) services only — DB rows use snake_case service_type
    this.services.set(list.filter((s: any) => Number(s.service_type ?? s.serviceType ?? 0) === 1));
  }

  onSave(): void {
    if (this.form.valid) {
      this.modalService.confirm(this.form.get('serviceAddress')?.value || '');
      this.form.reset({ serviceAddress: '' });
    }
  }

  onCancel(): void {
    this.modalService.cancel();
    this.form.reset({ serviceAddress: '' });
  }
}
