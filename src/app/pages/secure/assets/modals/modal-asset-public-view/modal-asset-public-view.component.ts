import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ModalAssetPublicViewService } from './modal-asset-public-view.service';
import { ApiService } from '../../../../../shared/services/api.service';
import { AssetMediaEntry } from '../../details/details.page';

@Component({
  selector: 'app-modal-asset-public-view',
  templateUrl: './modal-asset-public-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TranslatePipe],
})
export class ModalAssetPublicViewComponent {

  viewService = inject(ModalAssetPublicViewService);
  private apiService = inject(ApiService);

  bannerUrl = computed(() => {
    const d = this.viewService.data();
    const id = d?.media?.banner?.documentId;
    return id != null ? d!.imageUrls[id] ?? '' : '';
  });

  avatarUrl = computed(() => {
    const d = this.viewService.data();
    const id = d?.media?.avatar?.documentId;
    return id != null ? d!.imageUrls[id] ?? '' : '';
  });

  galleryImages = computed<AssetMediaEntry[]>(() => this.viewService.data()?.media?.images ?? []);

  publicDocuments = computed<AssetMediaEntry[]>(() => this.viewService.data()?.media?.documents ?? []);

  // Public contact info — shown as its own section when any field is present.
  hasContact = computed(() => {
    const c = this.viewService.data()?.contact;
    return !!(c && (c.email || c.phone || c.website || c.address));
  });

  async viewDocument(doc: AssetMediaEntry) {
    const d = this.viewService.data();
    if (!d) return;
    const res = await this.apiService.assetDocumentFetchFile(d.address, doc.documentId);
    if (res?.blobUrl) window.open(res.blobUrl, '_blank');
  }

  onClose(): void {
    this.viewService.close();
  }
}
