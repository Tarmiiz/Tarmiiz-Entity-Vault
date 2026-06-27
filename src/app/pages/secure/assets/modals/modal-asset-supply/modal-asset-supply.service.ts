import { Injectable, signal } from '@angular/core';

export interface AssetSupplyModalInput {
  // 'mint' = add to treasury supply, 'burn' = remove from treasury supply.
  mode: 'mint' | 'burn';
  symbol: string;
  // For burn we cap the amount at the asset's own treasury balance
  // (totalSupply - circulating). Optional; when omitted no cap is enforced.
  available?: number;
}

export interface AssetSupplyModalResult {
  // Plain integer token count (T20 token quantities are NOT wei-encoded).
  tokens: number;
}

@Injectable({ providedIn: 'root' })
export class ModalAssetSupplyService {
  isVisible = signal(false);
  input = signal<AssetSupplyModalInput | null>(null);

  private resolveFn?: (value: AssetSupplyModalResult | null) => void;

  show(input: AssetSupplyModalInput): Promise<AssetSupplyModalResult | null> {
    this.input.set(input);
    this.isVisible.set(true);
    return new Promise<AssetSupplyModalResult | null>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  confirm(result: AssetSupplyModalResult): void {
    this.isVisible.set(false);
    this.resolveFn?.(result);
  }

  cancel(): void {
    this.isVisible.set(false);
    this.resolveFn?.(null);
  }
}
