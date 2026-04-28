import { Component, ChangeDetectionStrategy, effect, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ModalListingCreateService } from './modal-listing-create.service';
import { ApiService } from '../../../../../../shared/services/api.service';

@Component({
  selector: 'app-modal-listing-create',
  templateUrl: './modal-listing-create.component.html',
  styleUrls: ['./modal-listing-create.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
})
export class ModalListingCreateComponent {
  modalService = inject(ModalListingCreateService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  assets = signal<any[]>([]);

  form = this.fb.group({
    baseAsset: ['', Validators.required],
    venue: [true],
    country: [false],
    global: [false],
  });

  constructor() {
    this.loadAssets();
    // When opened with a preset asset, lock the dropdown to that value.
    effect(() => {
      const preset = this.modalService.presetAsset();
      if (this.modalService.isVisible() && preset) {
        this.form.patchValue({ baseAsset: preset });
      }
    });
  }

  async loadAssets() {
    const data = await this.apiService.vaultGetAssets(0, 1000);
    this.assets.set(data?.assets ?? []);
  }

  onSave(): void {
    const v = this.form.value;
    const tierAtLeastOne = !!v.venue || !!v.country || !!v.global;
    if (this.form.valid && v.baseAsset && tierAtLeastOne) {
      this.modalService.confirm(v.baseAsset!, !!v.venue, !!v.country, !!v.global);
      this.form.reset({ baseAsset: '', venue: true, country: false, global: false });
    }
  }

  onCancel(): void {
    this.modalService.cancel();
    this.form.reset({ baseAsset: '', venue: true, country: false, global: false });
  }
}
