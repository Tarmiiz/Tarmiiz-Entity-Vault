import { Component, computed, inject, OnInit, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { HeaderComponent } from "../../../shared/components/header/header.component";

import { ApiService } from '../../../shared/services/api.service';
import { AlertService } from '../../../shared/components/alerts/alert/alert.service';
import { LoadingService } from '../../../shared/components/alerts/loading/loading.service';
import { AuthService } from '../../../shared/services/auth.service';

import { Entity } from '../../../shared/models/data.model';

import { ModalProfileMetadataEditService } from './modal-profile-metadata-edit/modal-profile-metadata-edit.service';
import { ModalProfileMetadataEditComponent } from './modal-profile-metadata-edit/modal-profile-metadata-edit.component';
import { ModalImageAddService } from '../../../shared/components/modal-image-add/modal-image-add.service';
import { ModalImageAddComponent } from '../../../shared/components/modal-image-add/modal-image-add.component';

// Entry inside a metadata `media` key (server-owned public docs/images index).
export interface MediaEntry { documentId: number; cid: string; title: string; fileType: string; }
export interface MediaIndex {
  avatar?: MediaEntry;
  banner?: MediaEntry;
  images?: MediaEntry[];
  documents?: MediaEntry[];
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    HeaderComponent,
    ModalProfileMetadataEditComponent,
    ModalImageAddComponent, TranslatePipe
]
})
export class ProfilePage implements OnInit {
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private loadingService = inject(LoadingService);
  private metadataEditService = inject(ModalProfileMetadataEditService);
  private imageAddModal = inject(ModalImageAddService);
  private authService = inject(AuthService);
  private translate = inject(TranslateService);

  activeTab = signal<'info' | 'metadata' | 'images'>('info');
  info = signal<Entity | undefined>(undefined);

  get entityActive() { return this.authService.entityActive(); }

  constructor() { }

  async ngOnInit() {}

  async ionViewWillEnter() {
    await this.getInfo();
  }

  ionViewWillLeave() {
    this.revokeMediaImageUrls();
  }

  setTab(tab: 'info' | 'metadata' | 'images') {
    this.activeTab.set(tab);
    if (tab === 'info' || tab === 'metadata') this.getInfo();
    if (tab === 'images') this.loadMediaImages();
  }

  async getInfo() {
    this.loadingService.show(this.translate.instant('common.loadingData'));
    const info = await this.apiService.vaultGetEntityInfo();
    this.info.set(info ?? undefined);
    this.loadingService.hide();
    if (this.activeTab() === 'images') this.loadMediaImages();
  }

  // ─── Images (public media — avatar / banner / gallery) ──────────────────────
  entityMedia = computed<MediaIndex | null>(() => {
    const meta = (this.info() as any)?.metadata;
    if (meta && typeof meta === 'object' && meta.media && typeof meta.media === 'object' && !Array.isArray(meta.media)) {
      return meta.media as MediaIndex;
    }
    return null;
  });

  mediaImages = computed<{ entry: MediaEntry; role: 'avatar' | 'banner' | 'gallery' }[]>(() => {
    const media = this.entityMedia();
    if (!media) return [];
    const rows: { entry: MediaEntry; role: 'avatar' | 'banner' | 'gallery' }[] = [];
    if (media.avatar) rows.push({ entry: media.avatar, role: 'avatar' });
    if (media.banner) rows.push({ entry: media.banner, role: 'banner' });
    for (const img of media.images ?? []) rows.push({ entry: img, role: 'gallery' });
    return rows;
  });

  mediaImageUrls = signal<Record<number, string>>({});
  mediaImagesLoading = signal(false);

  async loadMediaImages() {
    const rows = this.mediaImages();
    if (!rows.length) return;
    const current = this.mediaImageUrls();
    const missing = rows.filter(r => !current[r.entry.documentId]);
    if (!missing.length) return;
    this.mediaImagesLoading.set(true);
    try {
      for (const r of missing) {
        const res = await this.apiService.documentFetchFile(r.entry.documentId);
        if (res?.blobUrl) this.mediaImageUrls.update(m => ({ ...m, [r.entry.documentId]: res.blobUrl }));
      }
    } finally {
      this.mediaImagesLoading.set(false);
    }
  }

  private revokeMediaImageUrls() {
    for (const url of Object.values(this.mediaImageUrls())) URL.revokeObjectURL(url);
    this.mediaImageUrls.set({});
  }

  private async refreshMediaImages() {
    this.revokeMediaImageUrls();
    await this.getInfo();
    await this.loadMediaImages();
  }

  async openAddImageModal() {
    const data = await this.imageAddModal.show();
    if (!data) return;
    this.loadingService.show(this.translate.instant('media.uploading'));
    try {
      const res = await this.apiService.documentAddMultipart(data.file, {
        title: data.title,
        description: '',
        fileType: data.file.type,
        documentType: data.documentType,
        documentState: 1,
        ...(data.role !== 'gallery' ? { imageRole: data.role } : {}),
      });
      if (res?.error) this.alertService.show(this.translate.instant('alerts.error'), res.error);
      else await this.refreshMediaImages();
    } catch {
      this.alertService.show(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  async changeMediaRole(documentId: number, role: 'avatar' | 'banner' | 'gallery') {
    this.loadingService.show(this.translate.instant('media.updatingRole'));
    try {
      const res = await this.apiService.vaultSetEntityMediaRole(documentId, role);
      if (res?.error) this.alertService.show(this.translate.instant('alerts.error'), res.error);
      else await this.refreshMediaImages();
    } catch {
      this.alertService.show(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  async removeMediaImage(row: { entry: MediaEntry; role: string }) {
    const confirmed = await this.alertService.show(
      this.translate.instant('media.removeConfirmTitle'),
      this.translate.instant('media.removeConfirmMessage', { title: row.entry.title }),
      this.translate.instant('common.remove'),
    );
    if (!confirmed) return;
    this.loadingService.show(this.translate.instant('media.removing'));
    try {
      const res = await this.apiService.documentRemove(row.entry.documentId);
      if (res?.error) this.alertService.show(this.translate.instant('alerts.error'), res.error);
      else await this.refreshMediaImages();
    } catch {
      this.alertService.show(this.translate.instant('alerts.error'), this.translate.instant('alerts.unexpected'));
    } finally {
      this.loadingService.hide();
    }
  }

  // Normalized public-profile view (description + nested contact) with fallback to legacy
  // flat contact keys spread from the entity metadata.
  profileView = computed(() => {
    const e: any = this.info() ?? {};
    const c = (e.contact && typeof e.contact === 'object') ? e.contact : {};
    return {
      description: typeof e.description === 'string' ? e.description : '',
      email:   c.email   ?? e.email   ?? '',
      phone:   c.phone   ?? e.telephone ?? e.mobile ?? '',
      website: c.website ?? e.website ?? '',
      address: c.address ?? e.address ?? '',
    };
  });

  async openEditMetadataModal() {
    const current = this.info();
    if (!current) return;

    const pv = this.profileView();
    const result = await this.metadataEditService.show({
      description: pv.description,
      contact: { email: pv.email, phone: pv.phone, website: pv.website, address: pv.address },
    });
    if (!result) return;

    try {
      this.loadingService.show(this.translate.instant('profile.info.updatingDetails'));
      await new Promise(resolve => setTimeout(resolve, 0));
      await this.apiService.vaultUpdateEntityMetadata(result);
      await this.getInfo();
    } catch (error) {
      console.error('Failed to update details', error);
      this.alertService.show(this.translate.instant('profile.updateFailedTitle'), this.translate.instant('profile.info.updateFailedMessage'));
    } finally {
      this.loadingService.hide();
    }
  }

}
