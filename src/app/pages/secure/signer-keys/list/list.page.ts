import { Component, OnInit, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';

import { ModalSignerKeyAddService } from '../modals/modal-signer-key-add/modal-signer-key-add.service';
import { ModalSignerKeyAddComponent } from '../modals/modal-signer-key-add/modal-signer-key-add.component';

interface SignerKey {
  keyId: number;
  signer: string;
  encryptedPrivateKey: string;
  description: string;
  state: number;
  createdAt: number;
}

@Component({
  selector: 'app-signer-keys-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
  standalone: true,
  imports: [FormsModule, HeaderComponent, ModalSignerKeyAddComponent, TranslatePipe]
})
export class ListPage implements OnInit {
  private apiService = inject(ApiService);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  utils = inject(UtilsService);
  private addModal = inject(ModalSignerKeyAddService);

  loading = false;
  keys = signal<SignerKey[]>([]);
  total = 0;

  ngOnInit() {}

  async ionViewDidEnter() {
    this.loading = true;
    await this.list();
    this.loading = false;
  }

  async list() {
    this.loadingService.show('Loading signer keys...');
    const r = await this.apiService.signerKeyList(1, 200);
    if (r?.keys) {
      this.total = r.count ?? r.keys.length;
      this.keys.set(r.keys);
    }
    this.loadingService.hide();
  }

  stateLabel(s: number) { return s === 1 ? 'Active' : s === 2 ? 'Disabled' : String(s); }
  stateClass(s: number) {
    return s === 1 ? 'bg-green-100 text-green-800' : s === 2 ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-800';
  }

  async generate() {
    const description = await this.addModal.show();
    if (description === null) return;
    this.loadingService.show('Generating key...');
    try {
      const r = await this.apiService.signerKeyGenerate(description);
      if (r?.error) {
        this.alertService.show('Error', r.error);
      } else {
        await this.list();
      }
    } finally {
      this.loadingService.hide();
    }
  }

  async toggleState(k: SignerKey) {
    const newState = k.state === 1 ? 2 : 1;
    const action = newState === 2 ? 'Disable' : 'Activate';
    const ok = await this.alertService.show(action + ' Key', action + ' key #' + k.keyId + '?', action);
    if (!ok) return;
    this.loadingService.show('Updating...');
    try {
      const r = await this.apiService.signerKeyChangeState(String(k.keyId), newState);
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.list();
    } finally { this.loadingService.hide(); }
  }

  async remove(k: SignerKey) {
    const ok = await this.alertService.show('Remove Key', 'Permanently remove key #' + k.keyId + '?', 'Remove');
    if (!ok) return;
    this.loadingService.show('Removing...');
    try {
      const r = await this.apiService.signerKeyRemove(String(k.keyId));
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.list();
    } finally { this.loadingService.hide(); }
  }
}
