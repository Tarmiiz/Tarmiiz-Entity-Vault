import { Injectable, signal } from '@angular/core';
import { FeeConfig } from '../../../../../shared/models/data.model';

export interface ServiceFeeConfigModalInput {
  service: string;
  serviceName: string;
  // 'default' edits the SERVICE-LEVEL slot every un-overridden asset inherits — one write
  // covering all listings. 'asset' edits a single override.
  mode?: 'default' | 'asset';
  asset: string;
  assetSymbol: string;
  // The RAW override for this asset (null when it inherits), NOT the effective value.
  feeConfig: FeeConfig | null;
  // The service default, shown as context when editing an asset that currently inherits it.
  inherited?: FeeConfig | null;
  // Whether an explicit override exists. When false the form pre-fills from `inherited` and
  // Save stays disabled until something actually changes — otherwise opening and saving would
  // silently PIN an override, which is the opposite of what the operator looked at.
  isSet?: boolean;
}

export interface ServiceFeeConfigModalResult {
  feeConfig: FeeConfig;
}

@Injectable({ providedIn: 'root' })
export class ModalServiceFeeConfigService {
  isVisible = signal(false);
  input = signal<ServiceFeeConfigModalInput | null>(null);

  private resolveFn?: (value: ServiceFeeConfigModalResult | null) => void;

  show(input: ServiceFeeConfigModalInput): Promise<ServiceFeeConfigModalResult | null> {
    this.input.set(input);
    this.isVisible.set(true);
    return new Promise<ServiceFeeConfigModalResult | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(result: ServiceFeeConfigModalResult): void {
    this.isVisible.set(false);
    this.resolveFn?.(result);
  }

  cancel(): void {
    this.isVisible.set(false);
    this.resolveFn?.(null);
  }
}
