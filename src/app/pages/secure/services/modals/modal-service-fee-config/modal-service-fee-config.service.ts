import { Injectable, signal } from '@angular/core';
import { FeeConfig } from '../../../../../shared/models/data.model';

export interface ServiceFeeConfigModalInput {
  service: string;
  serviceName: string;
  asset: string;
  assetSymbol: string;
  feeConfig: FeeConfig | null;
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
