import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalAssetAddService, AddAssetData } from './modal-asset-add.service';
import { ApiService } from '../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-asset-add',
  templateUrl: './modal-asset-add.component.html',
  styleUrls: ['./modal-asset-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ModalAssetAddComponent {

  addAssetService = inject(ModalAssetAddService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  services = signal<{ address: string; name: string }[]>([]);
  countries = signal<{ countryCode: number; nameShort: string; currencyCode: string }[]>([]);
  regulators = signal<{ address: string; name: string; symbol: string }[]>([]);
  tokenTypes = signal<{ id: number; name: string }[]>([]);
  assetTypes = signal<{ id: number; name: string }[]>([]);

  addForm = this.fb.group({
    owner: ['', Validators.required],
    issuer: ['', Validators.required],
    manager: ['', Validators.required],
    name: ['', Validators.required],
    symbol: ['', Validators.required],
    tokenType: ['', Validators.required],
    assetType: [''],
    initialSupply: [''],
    description: ['', Validators.required],
    service: ['', Validators.required],
    currency: ['', Validators.required],
    regulator: ['', Validators.required],
    creditSettlement: [false],
  });

  get isBasicToken(): boolean {
    return this.addForm.get('tokenType')?.value === '1';
  }

  constructor() {
    this.loadServices();
    this.loadCountriesAndRegulators();
    this.loadTokenAndAssetTypes();

    this.addForm.get('tokenType')!.valueChanges.subscribe(val => {
      const assetTypeCtrl = this.addForm.get('assetType')!;
      const initialSupplyCtrl = this.addForm.get('initialSupply')!;
      if (val === '1') {
        assetTypeCtrl.setValidators(Validators.required);
        initialSupplyCtrl.setValidators([Validators.required, Validators.min(0)]);
      } else {
        assetTypeCtrl.clearValidators();
        initialSupplyCtrl.clearValidators();
        assetTypeCtrl.setValue('');
        initialSupplyCtrl.setValue('');
      }
      assetTypeCtrl.updateValueAndValidity();
      initialSupplyCtrl.updateValueAndValidity();
    });
  }

  async loadServices() {
    const data = await this.apiService.vaultGetServicesOwn(0, 50);
    if (data?.services) {
      this.services.set(data.services.map((s: any) => ({ address: s.address, name: s.name })));
    }
  }

  async loadCountriesAndRegulators() {
    const [countries, entity] = await Promise.all([
      this.apiService.vaultGetCountries(),
      this.apiService.vaultGetEntityInfo(),
    ]);
    if (countries) {
      this.countries.set(countries.map((c: any) => ({
        countryCode: c.country_code,
        nameShort: c.name_short,
        currencyCode: c.currency_code,
      })));
    }
    if (entity) {
      const regulators = await this.apiService.vaultGetRegulatorsByCountry(String(entity.country_code), 0, 100);
      if (regulators) {
        this.regulators.set(regulators.filter((r: any) => r.state).map((r: any) => ({
          address: r.address,
          name: r.name,
          symbol: r.symbol,
        })));
      }
    }
  }

  async loadTokenAndAssetTypes() {
    const [tokenTypesRaw, assetTypesRaw] = await Promise.all([
      this.apiService.vaultGetGlobalVariablesByCategory('Asset Token Type'),
      this.apiService.vaultGetGlobalVariablesByCategory('Asset Type'),
    ]);
    if (tokenTypesRaw) {
      this.tokenTypes.set(tokenTypesRaw.map((v: any) => ({ id: v.variable_id, name: v.name })));
    }
    if (assetTypesRaw) {
      this.assetTypes.set(assetTypesRaw.map((v: any) => ({ id: v.variable_id, name: v.name })));
    }
  }

  onSave(): void {
    if (this.addForm.invalid) return;

    const formValue = this.addForm.getRawValue();
    const tokenType = Number(formValue.tokenType);
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
      tokenType,
      creditSettlement: formValue.creditSettlement === true,
      ...(tokenType === 1 ? {
        assetType: Number(formValue.assetType),
        initialSupply: Number(formValue.initialSupply),
      } : {}),
    };
    this.addAssetService.confirm(data);
  }

  onCancel(): void {
    this.addAssetService.cancel();
  }
}
