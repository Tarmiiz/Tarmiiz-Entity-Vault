import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalAssetAddService, AddAssetData } from './modal-asset-add.service';
import { RpcService } from '../../../../../shared/services/rpc.service';
import { environment } from '../../../../../../environments/environment';

@Component({
  selector: 'app-modal-asset-add',
  templateUrl: './modal-asset-add.component.html',
  styleUrls: ['./modal-asset-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalAssetAddComponent {

  addAssetService = inject(ModalAssetAddService);
  private rpcService = inject(RpcService);
  private fb = inject(FormBuilder);

  services = signal<{ address: string; name: string }[]>([]);
  countries = signal<{ countryCode: number; nameShort: string; currencyCode: string }[]>([]);
  regulators = signal<{ address: string; name: string; symbol: string }[]>([]);

  addForm = this.fb.group({
    owner: ['', Validators.required],
    issuer: ['', Validators.required],
    manager: ['', Validators.required],
    name: ['', Validators.required],
    symbol: ['', Validators.required],
    description: ['', Validators.required],
    service: ['', Validators.required],
    currency: ['', Validators.required],
    regulator: ['', Validators.required],
  });

  constructor() {
    this.loadServices();
    this.loadCountries();
  }

  async loadServices() {
    const data = await this.rpcService.servicesListOwn(1, 100);
    if (data.result) {
      this.services.set(data.result.services.map((s: any) => ({ address: s.address, name: s.name })));
    }
  }

  async loadCountries() {
    await this.rpcService.connectVariablesProxyContract();
    const data = await this.rpcService.getCountriesList();
    if (data.result) {
      this.countries.set(data.result.map((c: any) => ({
        countryCode: c.countryCode,
        nameShort: c.nameShort,
        currencyCode: c.currencyCode,
      })));
    }
  }

  async onCurrencyChange(event: Event) {
    const countryCode = Number((event.target as HTMLSelectElement).value);
    this.regulators.set([]);
    this.addForm.patchValue({ regulator: '' });
    if (!countryCode) return;
    const data = await this.rpcService.regulatorsListByCountry(countryCode, 1, 100);
    if (data.result) {
      this.regulators.set(data.result.regulators.filter((r: any) => r.state));
    }
  }

  onSave(): void {
    if (this.addForm.invalid) return;

    const formValue = this.addForm.getRawValue();
    const data: AddAssetData = {
      owner: formValue.owner ?? '',
      issuer: formValue.issuer ?? '',
      manager: formValue.manager ?? '',
      name: formValue.name ?? '',
      symbol: formValue.symbol ?? '',
      description: formValue.description ?? '',
      service: formValue.service ?? '',
      currency: Number(formValue.currency),
      regulator: formValue.regulator ?? '',
    };
    this.addAssetService.confirm(data);
  }

  onCancel(): void {
    this.addAssetService.cancel();
  }
}
