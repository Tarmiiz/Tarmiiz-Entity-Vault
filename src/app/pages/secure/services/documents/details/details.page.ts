import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ethers } from 'ethers';

import { HeaderComponent } from '../../../../../shared/components/header/header.component';
import { ApiService } from '../../../../../shared/services/api.service';
import { LoadingService } from '../../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../../shared/services/utils.service';

import { Document, DocumentSignature, GlobalVariable } from '../../../../../shared/models/data.model';

import { ModalDocumentShareService } from '../../../documents/modals/modal-document-share/modal-document-share.service';
import { ModalDocumentShareComponent } from '../../../documents/modals/modal-document-share/modal-document-share.component';
import { ModalDocumentSignService } from '../../../documents/modals/modal-document-sign/modal-document-sign.service';
import { ModalDocumentSignComponent } from '../../../documents/modals/modal-document-sign/modal-document-sign.component';
import { AuthService } from '../../../../../shared/services/auth.service';

type TabId = 'info' | 'sharing' | 'signatures';

@Component({
  selector: 'app-service-document-details',
  templateUrl: './details.page.html',
  standalone: true,
  imports: [FormsModule, RouterLink, HeaderComponent, ModalDocumentShareComponent, ModalDocumentSignComponent, TranslatePipe]
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

  serviceAddress = signal<string>('');
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
    this.serviceAddress.set(this.route.snapshot.paramMap.get('address') || '');
    this.id.set(this.route.snapshot.paramMap.get('id') || '');
  }

  async ionViewDidEnter() { await this.loadAll(); }

  async loadAll() {
    this.loadingService.show('Loading document...');
    try {
      await Promise.all([this.loadDocument(), this.loadShared(), this.loadSignatures(), this.loadGlobals()]);
    } finally { this.loadingService.hide(); }
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

  async loadDocument() {
    const r = await this.apiService.serviceDocumentGet(this.serviceAddress(), this.id());
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
    const r = await this.apiService.serviceDocumentGetSharedWith(this.serviceAddress(), this.id());
    if (r?.accounts) this.sharedWith.set(r.accounts);
  }

  async loadSignatures() {
    const r = await this.apiService.serviceDocumentSignatures(this.serviceAddress(), this.id(), 1, 100);
    if (r?.signatures) this.signatures.set(r.signatures);
  }

  setTab(id: TabId) { this.activeTab.set(id); }

  typeLabel(t?: number): string { return this.docTypes().find(v => v.variableId === t)?.name || String(t ?? ''); }
  stateLabel(s?: number): string { return this.docStates().find(v => v.variableId === s)?.name || String(s ?? ''); }
  reviewStateLabel(s?: number): string { return this.reviewStates().find(v => v.variableId === s)?.name || String(s ?? ''); }
  stateClass(s?: number): string {
    switch (s) {
      case 1: return 'bg-green-100 text-green-800';
      case 2: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  async deleteDocument() {
    if (!(await this.alertService.show('Delete Document', 'Soft-delete this document?', 'Delete'))) return;
    this.loadingService.show('Updating...');
    try {
      const r = await this.apiService.serviceDocumentSetState(this.serviceAddress(), this.id(), 2);
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.loadDocument();
    } finally { this.loadingService.hide(); }
  }

  async restoreDocument() {
    this.loadingService.show('Updating...');
    try {
      const r = await this.apiService.serviceDocumentSetState(this.serviceAddress(), this.id(), 1);
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.loadDocument();
    } finally { this.loadingService.hide(); }
  }

  async shareWithNew() {
    const account = await this.shareModal.show();
    if (!account) return;
    this.loadingService.show('Sharing...');
    try {
      const r = await this.apiService.serviceDocumentShare(this.serviceAddress(), this.id(), account);
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.loadShared();
    } finally { this.loadingService.hide(); }
  }

  async unshare(account: string) {
    if (!(await this.alertService.show('Revoke Access', 'Revoke access for ' + account + '?', 'Revoke'))) return;
    this.loadingService.show('Updating...');
    try {
      const r = await this.apiService.serviceDocumentUnshare(this.serviceAddress(), this.id(), account);
      if (r?.error) this.alertService.show('Error', r.error);
      else await this.loadShared();
    } finally { this.loadingService.hide(); }
  }

  private sniffMime(bytes: Uint8Array): string {
    const b = bytes;
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
    if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06)) return 'application/zip';
    if (b.length >= 5 && b[0] === 0x7b) return 'application/json';
    if (b.length >= 4 && b[0] === 0x3c) return 'text/html';
    try {
      const sample = new TextDecoder('utf-8', { fatal: true }).decode(b.slice(0, Math.min(512, b.length)));
      if (/^[\x09\x0a\x0d\x20-\x7e]*$/.test(sample)) return 'text/plain';
    } catch { /* binary */ }
    return 'application/octet-stream';
  }

  async signDocument() {
    const doc = this.document();
    if (!doc?.cid) return;
    const keyId = await this.signModal.show();
    if (keyId === null) return;
    this.loadingService.show('Hashing file + signing...');
    try {
      const r = await this.apiService.ipfsFetchData(doc.cid);
      if (!r?.success || !r?.data) { this.alertService.show('Error', 'Could not fetch file from IPFS for hashing.'); return; }
      const base64 = typeof r.data === 'string' ? r.data : '';
      const byteString = atob(base64);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);

      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const docHash = '0x' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');

      const signRes = await this.apiService.serviceDocumentSign(this.serviceAddress(), this.id(), keyId, docHash);
      if (signRes?.error) this.alertService.show('Error', signRes.error);
      else { await this.loadSignatures(); this.activeTab.set('signatures'); }
    } finally { this.loadingService.hide(); }
  }

  async verifySignature(sig: DocumentSignature) {
    const doc = this.document();
    if (!doc?.cid) return;
    this.loadingService.show('Verifying signature...');
    try {
      const r = await this.apiService.ipfsFetchData(doc.cid);
      if (!r?.success || !r?.data) { this.alertService.show('Error', 'Could not fetch file from IPFS.'); return; }
      const byteString = atob(typeof r.data === 'string' ? r.data : '');
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
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
      const r = await this.apiService.ipfsFetchData(doc.cid);
      if (!r?.success || !r?.data) { this.alertService.show('Error', 'Could not fetch file from IPFS.'); return; }
      const base64 = typeof r.data === 'string' ? r.data : '';
      const byteString = atob(base64);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      const mime = doc.fileType || this.sniffMime(bytes);
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally { this.loadingService.hide(); }
  }
}
