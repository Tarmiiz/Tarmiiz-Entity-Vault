import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalAddSubscriptionService } from './modal-add-subscription.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';

@Component({
  selector: 'app-modal-add-subscription',
  templateUrl: './modal-add-subscription.component.html',
  styleUrls: ['./modal-add-subscription.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalAddSubscriptionComponent {
  modalService = inject(ModalAddSubscriptionService);
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private fb = inject(FormBuilder);

  mode = signal<'A' | 'B'>('A');
  services = signal<{ address: string; name: string }[]>([]);
  countries = signal<{ countryCode: number; name: string }[]>([]);

  form = this.fb.group({
    service: ['', Validators.required],
    // Mode A
    didHash: [''],
    // Mode B
    uniqueIdHash: [''],
    email: [''],
    mobile: [''],
    didType: [1 as number | null],
    countryCode: [null as number | null],
    trxRefNo: [''],
    trxTimestamp: [''],
    level: [2 as number | null],
  });

  constructor() {
    effect(() => {
      if (this.modalService.isVisible()) {
        this.resetForm();
        this.loadServices();
        this.loadCountries();
      }
    });
  }

  private resetForm() {
    this.mode.set('A');
    this.form.reset({
      service: '',
      didHash: '',
      uniqueIdHash: '',
      email: '',
      mobile: '',
      didType: 1,
      countryCode: null,
      trxRefNo: '',
      trxTimestamp: '',
      level: 2,
    });
  }

  async loadServices() {
    const data = await this.apiService.vaultGetServicesOwn(0, 200);
    if (data?.services) {
      this.services.set(
        data.services
          .filter((s: any) => Number(s.service_type) === 1 && Number(s.state) === 2)
          .map((s: any) => ({ address: s.address, name: s.name || s.address }))
      );
    }
  }

  async loadCountries() {
    const list = await this.apiService.vaultGetCountries();
    if (list) {
      this.countries.set(
        list
          .map((c: any) => ({
            countryCode: c.country_code ?? c.countryCode,
            name: c.name_short ?? c.name_full ?? c.name ?? String(c.country_code ?? ''),
          }))
          .filter((c: any) => c.countryCode != null)
      );
    }
  }

  setMode(mode: 'A' | 'B') {
    this.mode.set(mode);
  }

  private isModeAValid(): boolean {
    return !!(this.form.value.service && this.form.value.didHash);
  }

  private isModeBValid(): boolean {
    const v = this.form.value;
    return !!(v.service && v.uniqueIdHash && v.email && v.mobile && v.didType && v.countryCode && v.trxRefNo && v.trxTimestamp && v.level);
  }

  canSubmit(): boolean {
    return this.mode() === 'A' ? this.isModeAValid() : this.isModeBValid();
  }

  async onSubmit() {
    if (!this.canSubmit()) return;
    const v = this.form.value;
    const body: Record<string, any> = { service: v.service };
    if (this.mode() === 'A') {
      body['didHash'] = v.didHash;
    } else {
      body['uniqueIdHash'] = v.uniqueIdHash;
      body['email'] = v.email;
      body['mobile'] = v.mobile;
      body['didType'] = Number(v.didType);
      body['countryCode'] = Number(v.countryCode);
      body['trxRefNo'] = v.trxRefNo;
      body['trxTimestamp'] = Math.floor(new Date(v.trxTimestamp as string).getTime() / 1000);
      body['level'] = Number(v.level);
    }

    this.loadingService.show('Creating subscription...');
    const res = await this.apiService.usersOnboard(body);
    this.loadingService.hide();

    if (res.error || !res.subscriptionAddress) {
      await this.alertService.show('Error', res.error || 'Failed to create subscription');
      return;
    }
    this.modalService.confirm(res.subscriptionAddress);
  }

  onCancel() {
    this.modalService.cancel();
  }
}
