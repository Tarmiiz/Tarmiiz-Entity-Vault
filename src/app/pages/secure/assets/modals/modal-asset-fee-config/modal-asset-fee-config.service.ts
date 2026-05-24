import { Injectable, signal } from '@angular/core';
import { FeeConfig } from '../../../../../shared/models/data.model';

export interface AssetFeeConfigModalInput {
  asset: string;
  assetSymbol: string;
  service: string;
  serviceName: string;
  feeConfig: FeeConfig | null;
}

export interface AssetFeeConfigModalResult {
  feeConfig: FeeConfig;
}

@Injectable({ providedIn: 'root' })
export class ModalAssetFeeConfigService {
  isVisible = signal(false);
  input = signal<AssetFeeConfigModalInput | null>(null);

  private resolveFn?: (value: AssetFeeConfigModalResult | null) => void;

  show(input: AssetFeeConfigModalInput): Promise<AssetFeeConfigModalResult | null> {
    this.input.set(input);
    this.isVisible.set(true);
    return new Promise<AssetFeeConfigModalResult | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(result: AssetFeeConfigModalResult): void {
    this.isVisible.set(false);
    this.resolveFn?.(result);
  }

  cancel(): void {
    this.isVisible.set(false);
    this.resolveFn?.(null);
  }
}
