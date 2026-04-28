import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class FeaturesService {
  private apiService = inject(ApiService);

  dex    = signal(false);
  loaded = signal(false);

  private inflight: Promise<void> | null = null;

  constructor() {
    // Eagerly fetch on first injection so menu/route guards have an answer ASAP.
    this.refresh();
  }

  refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const features = await this.apiService.vaultFeatures();
        this.dex.set(!!features?.dex);
      } finally {
        this.loaded.set(true);
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}
