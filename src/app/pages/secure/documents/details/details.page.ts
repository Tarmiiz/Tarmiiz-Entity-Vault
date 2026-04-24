import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ethers } from 'ethers';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';

import { Document, DocumentSignature, GlobalVariable } from '../../../../shared/models/data.model';

import { ModalDocumentShareService } from '../modals/modal-document-share/modal-document-share.service';
import { ModalDocumentShareComponent } from '../modals/modal-document-share/modal-document-share.component';
import { ModalDocumentSignService } from '../modals/modal-document-sign/modal-document-sign.service';
import { ModalDocumentSignComponent } from '../modals/modal-document-sign/modal-document-sign.component';
import { AuthService } from '../../../../shared/services/auth.service';

type TabId = 'info' | 'sharing' | 'signatures';

@Component({
  selector: 'app-documents-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
  standalone: true,
  imports: [FormsModule, RouterLink, HeaderComponent, ModalDocumentShareComponent, ModalDocumentSignComponent]
})
export class DetailsPage implements OnInit {
  private apiService = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private authService = inject(AuthService);
  utils = inject(UtilsService);

  private shareModal = inject(ModalDocumentShareService);
  private signModal = inject(ModalDocumentSignService);

  isExecutive = () => Number(this.authService.userInfo?.role) === 2;

  id = signal<string>('');
  document = signal<Document | null>(null);
  sharedWith = signal<string[]>([]);
  signatures = signal<DocumentSignature[]>([]);
  activeTab = signal<TabId>('info');

  docTypes = signal<GlobalVariable[]>([]);
  docStates = signal<GlobalVariable[]>([]);
  reviewStates = signal<GlobalVariable[]>([]);

  ownerDisplay = signal<string>('');
  ownerAddress = signal<string>('');

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id') || '';
    this.id.set(idParam);
  }

  async ionViewDidEnter() {
    await this.loadAll();
  }

  async loadAll() {
    this.loadingService.show('Loading document...');
    try {
      await Promise.all([this.loadDocument(), this.loadShared(), this.loadSignatures(), this.loadGlobals()]);
    } finally {
      this.loadingService.hide();
    }
  }

  async loadGlobals() {
    const [typesRes, statesRes, reviewRes] = await Promise.all([
      this.apiService.vaultGetGlobalVariablesList('Document Type'),
      this.apiService.vaultGetGlobalVariablesList('Document State'),
      this.apiService.vaultGetGlobalVariablesList('Document Review State'),
    ]);
    if (typesRes?.variables)  this.docTypes.set(typesRes.variables as GlobalVariable[]);
    if (statesRes?.variables) this.docStates.set(statesRes.variables as GlobalVariable[]);
    if (reviewRes?.variables) this.reviewStates.set(reviewRes.variables as GlobalVariable[]);
  }

  async loadSignatures() {
    const r = await this.apiService.documentSignatures(this.id(), 1, 100);
    if (r?.signatures) this.signatures.set(r.signatures);
  }

  setTab(id: TabId) { this.activeTab.set(id); }

  async loadDocument() {
    const r = await this.apiService.documentGet(this.id());
    if (r?.document) {
      this.document.set(r.document);
      this.resolveOwner(r.document);
    }
  }

  async resolveOwner(doc: Document) {
    const uid = Number(doc?.createdByUserId || 0);
    if (!uid) return;
    try {
      const [user, key] = await Promise.all([
        this.apiService.vaultGetUser(String(uid)),
        this.apiService.vaultGetUserDefaultKey(uid),
      ]);
      const name = user?.name || user?.username;
      if (name) this.ownerDisplay.set(name);
      if (key?.address) this.ownerAddress.set(key.address);
    } catch { /* fallback to raw owner */ }
  }

  async loadShared() {
    const r = await this.apiService.documentGetSharedWith(this.id());
    if (r?.accounts) this.sharedWith.set(r.accounts);
  }

  typeLabel(t?: number): string {
    return this.docTypes().find(v => v.variableId === t)?.name || String(t ?? '');
  }
  stateLabel(s?: number): string {
    return this.docStates().find(v => v.variableId === s)?.name || String(s ?? '');
  }
  reviewStateLabel(s?: number): string {
    return this.reviewStates().find(v => v.variableId === s)?.name || String(s ?? '');
  }
  stateClass(s?: number): string {
    switch (s) {
      case 1: return 'bg-green-100 text-green-800';
      case 2: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  async deleteDocument() {
    if (!confirm('Soft-delete this document?')) return;
    this.loadingService.show('Updating...');
    try {
      const r = await this.apiService.documentSetState(this.id(), 2);
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.loadDocument();
    } finally { this.loadingService.hide(); }
  }

  async restoreDocument() {
    this.loadingService.show('Updating...');
    try {
      const r = await this.apiService.documentSetState(this.id(), 1);
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.loadDocument();
    } finally { this.loadingService.hide(); }
  }

  async shareWithNew() {
    const account = await this.shareModal.show();
    if (!account) return;
    this.loadingService.show('Sharing...');
    try {
      const r = await this.apiService.documentShare(this.id(), account);
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.loadShared();
    } finally { this.loadingService.hide(); }
  }

  async unshare(account: string) {
    if (!confirm('Revoke access for ' + account + '?')) return;
    this.loadingService.show('Updating...');
    try {
      const r = await this.apiService.documentUnshare(this.id(), account);
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.loadShared();
    } finally { this.loadingService.hide(); }
  }

  // Fetches the decrypted file bytes via the streaming endpoint. The API does all crypto (Public
  // plaintext passthrough; Private - unwrap DEK + AES-GCM decrypt), so the frontend just gets raw
  // bytes back. Returns null on failure (alert already shown).
  private async _fetchFileBytes(): Promise<ArrayBuffer | null> {
    const fetched = await this.apiService.documentFetchFile(this.id());
    if (!fetched) {
      this.alertService.show('Error', 'Could not fetch file.');
      return null;
    }
    try {
      const res = await fetch(fetched.blobUrl);
      return await res.arrayBuffer();
    } finally {
      URL.revokeObjectURL(fetched.blobUrl);
    }
  }

  async signDocument() {
    const doc = this.document();
    if (!doc?.cid) return;
    const keyId = await this.signModal.show();
    if (keyId === null) return;
    this.loadingService.show('Hashing file + signing...');
    try {
      const buf = await this._fetchFileBytes();
      if (!buf) return;
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const docHash = '0x' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');

      const signRes = await this.apiService.documentSign(this.id(), keyId, docHash);
      if (signRes?.error) {
        this.alertService.show('Error', signRes.error);
      } else {
        await this.loadSignatures();
        this.activeTab.set('signatures');
      }
    } finally {
      this.loadingService.hide();
    }
  }

  async verifySignature(sig: DocumentSignature) {
    const doc = this.document();
    if (!doc?.cid) return;
    this.loadingService.show('Verifying signature...');
    try {
      const buf = await this._fetchFileBytes();
      if (!buf) return;
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const currentHash = '0x' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');

      const hashMatches = currentHash.toLowerCase() === (sig.docHash || '').toLowerCase();
      let recovered = '';
      try { recovered = ethers.verifyMessage(ethers.getBytes(sig.docHash), sig.signature); } catch { recovered = ''; }
      const signerMatches = recovered.toLowerCase() === (sig.signer || '').toLowerCase();

      const ok = hashMatches && signerMatches;
      const lines = [
        ok ? '✅ Signature is VALID' : '❌ Signature is INVALID',
        '',
        'Signer (expected):  ' + sig.signer,
        'Signer (recovered): ' + (recovered || '—'),
        'Hash  (attested):   ' + sig.docHash,
        'Hash  (current):    ' + currentHash,
        '',
        hashMatches ? 'File hash matches — content has not changed since signing.' : '⚠ File hash has changed — content differs from what was signed.',
        signerMatches ? 'Signer recovered from signature matches the expected signer.' : '⚠ Recovered signer does NOT match the expected signer.',
      ];
      this.alertService.show(ok ? 'Signature Valid' : 'Signature Check Failed', lines.join('\n'));
    } finally { this.loadingService.hide(); }
  }

  async viewFile() {
    const doc = this.document();
    if (!doc?.cid) return;
    this.loadingService.show('Fetching file...');
    try {
      const fetched = await this.apiService.documentFetchFile(this.id());
      if (!fetched) {
        this.alertService.show('Error', 'Could not fetch file.');
        return;
      }
      window.open(fetched.blobUrl, '_blank');
      // Give the new tab time to load the blob before revoking (MIME & Content-Disposition already
      // set by the API response). One minute is enough even for slower devices.
      setTimeout(() => URL.revokeObjectURL(fetched.blobUrl), 60_000);
    } finally {
      this.loadingService.hide();
    }
  }

  // Private → Public one-way conversion. Deletes all inbound shares + wrapped DEKs and re-pins
  // the file as plaintext on IPFS. The reverse direction is not offered — once a CID is on IPFS
  // as plaintext, future reads can come from cache/mirrors regardless of what we do on-chain.
  async publishDocument() {
    const doc = this.document();
    if (!doc) return;
    if (doc.documentType !== 2) {
      this.alertService.show('Not applicable', 'Only Private documents can be published.');
      return;
    }
    const ok = confirm(
      'Make this document Public?\n\n' +
      'The file will be re-uploaded to IPFS as plaintext — anyone with the CID will be able to read it. ' +
      'This cannot be undone: Public → Private conversion is not supported.'
    );
    if (!ok) return;
    this.loadingService.show('Publishing...');
    try {
      const r = await this.apiService.documentPublish(this.id());
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.loadAll();
    } finally {
      this.loadingService.hide();
    }
  }

}
