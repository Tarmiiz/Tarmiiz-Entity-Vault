import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ethers } from 'ethers';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';

import { Document, DocumentSignature, DocumentVersion, GlobalVariable } from '../../../../shared/models/data.model';

import { ModalDocumentShareService } from '../modals/modal-document-share/modal-document-share.service';
import { ModalDocumentShareComponent } from '../modals/modal-document-share/modal-document-share.component';
import { ModalDocumentSignService } from '../modals/modal-document-sign/modal-document-sign.service';
import { ModalDocumentSignComponent } from '../modals/modal-document-sign/modal-document-sign.component';
import { AuthService } from '../../../../shared/services/auth.service';

type TabId = 'info' | 'sharing' | 'signatures' | 'versions';

@Component({
  selector: 'app-documents-details',
  templateUrl: './details.page.html',
  styleUrls: ['./details.page.scss'],
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
  private translate = inject(TranslateService);
  utils = inject(UtilsService);

  private shareModal = inject(ModalDocumentShareService);
  private signModal = inject(ModalDocumentSignService);

  isExecutive = () => Number(this.authService.userInfo?.role) === 2;
  isViewer    = () => Number(this.authService.userInfo?.role) === 3;

  id = signal<string>('');
  document = signal<Document | null>(null);
  sharedWith = signal<string[]>([]);
  sharedWithDirectory = signal<Record<string, { name: string; partyType: number } | null>>({});

  // Hide the owner from the sharing list — the owner is added as a recipient at upload time so the
  // uploading API can still decrypt the doc, but exposing them as a "shared with" row is confusing.
  visibleSharedWith = computed(() => {
    const owner = (this.document()?.owner || '').toLowerCase();
    return this.sharedWith().filter(a => a.toLowerCase() !== owner);
  });
  signatures = signal<DocumentSignature[]>([]);
  versions = signal<DocumentVersion[]>([]);
  activeTab = signal<TabId>('info');

  // Replace-file state (the affordance that actually produces versions past v1).
  replacing = signal(false);
  replaceProgress = signal(0);

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
    this.loadingService.show(this.translate.instant('documents.details.loading.document'));
    try {
      await Promise.all([this.loadDocument(), this.loadShared(), this.loadSignatures(), this.loadVersions(), this.loadGlobals()]);
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

  async loadVersions() {
    const r = await this.apiService.documentVersions(this.id(), 1, 200);
    if (r?.versions) this.versions.set(r.versions);
  }

  setTab(id: TabId) { this.activeTab.set(id); }

  // ── Replace file ────────────────────────────────────────────────────────────────────────
  // Uploads a new file over the existing document: the API re-encrypts under a fresh DEK,
  // re-wraps it for the CURRENT recipient set, re-pins, and updates the cid — appending a
  // version row. Type / state / ACL are preserved.
  triggerReplace(input: HTMLInputElement) { input.click(); }

  async onReplaceFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';                       // let the same file be picked again after a failure
    if (!file) return;

    const confirmed = await this.alertService.show(
      this.translate.instant('documents.details.confirm.replaceTitle'),
      this.translate.instant('documents.details.confirm.replaceMessage'),
      this.translate.instant('documents.details.actions.replaceFile')
    );
    if (!confirmed) return;

    this.replacing.set(true);
    this.replaceProgress.set(0);
    try {
      const r = await this.apiService.documentReplaceFile(
        this.id(), file, { fileType: file.type }, p => this.replaceProgress.set(p)
      );
      if (r?.error) {
        this.alertService.info(this.translate.instant('alerts.error'), r.error);
        return;
      }
      await Promise.all([this.loadDocument(), this.loadVersions(), this.loadShared()]);
      this.setTab('versions');
    } finally {
      this.replacing.set(false);
      this.replaceProgress.set(0);
    }
  }

  formatBytes(bytes: number | null): string {
    if (bytes === null || bytes === undefined) return '—';
    if (bytes < 1024) return bytes + ' B';
    const units = ['KB', 'MB', 'GB'];
    let v = bytes / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(1) + ' ' + units[i];
  }

  // Middle-truncate a long hash/CID for a table cell; the full value stays in the title attr.
  truncate(value: string | null, lead = 10, tail = 6): string {
    if (!value) return '—';
    return value.length <= lead + tail + 1 ? value : value.slice(0, lead) + '…' + value.slice(-tail);
  }

  async copyToClipboard(value: string | null) {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); } catch { /* clipboard unavailable */ }
  }

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
    const accounts: string[] = r?.accounts ?? [];
    this.sharedWith.set(accounts);
    this.sharedWithDirectory.set({});
    await Promise.all(accounts.map(async a => {
      const entry = await this.apiService.vaultDirectoryByAddress(a);
      if (entry) {
        this.sharedWithDirectory.update(m => ({ ...m, [a.toLowerCase()]: { name: entry.name, partyType: entry.partyType } }));
      }
    }));
  }

  sharedWithLabel(address: string): string {
    return this.sharedWithDirectory()[address.toLowerCase()]?.name ?? address;
  }

  sharedWithKindLabel(address: string): string {
    const entry = this.sharedWithDirectory()[address.toLowerCase()];
    if (!entry) return '';
    switch (entry.partyType) {
      case 2: return this.translate.instant('partyType.entity');
      case 3: return this.translate.instant('partyType.regulator');
      case 4: return this.translate.instant('partyType.service');
      case 5: return this.translate.instant('partyType.subscription');
      default: return '';
    }
  }

  sharedWithKindBadgeClass(address: string): string {
    const entry = this.sharedWithDirectory()[address.toLowerCase()];
    if (!entry) return 'bg-gray-100 text-gray-700';
    switch (entry.partyType) {
      case 2: return 'bg-blue-100 text-blue-800';
      case 3: return 'bg-purple-100 text-purple-800';
      case 4: return 'bg-amber-100 text-amber-800';
      case 5: return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  typeLabel(t?: number): string {
    switch (t) {
      case 1: return this.translate.instant('documents.type.public');
      case 2: return this.translate.instant('documents.type.private');
      case 3: return this.translate.instant('documents.type.internal');
      default: return String(t ?? '');
    }
  }
  typeClass(t?: number): string {
    switch (t) {
      case 1: return 'bg-blue-100 text-blue-800';
      case 2: return 'bg-yellow-100 text-yellow-800';
      case 3: return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  stateLabel(s?: number): string {
    switch (s) {
      case 1: return this.translate.instant('documents.docState.active');
      case 2: return this.translate.instant('documents.docState.deleted');
      default: return String(s ?? '');
    }
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
    if (!(await this.alertService.show(this.translate.instant('documents.details.confirm.deleteTitle'), this.translate.instant('documents.details.confirm.deleteMessage'), this.translate.instant('common.delete')))) return;
    this.loadingService.show(this.translate.instant('common.updating'));
    try {
      const r = await this.apiService.documentSetState(this.id(), 2);
      if (r?.error) this.alertService.info(this.translate.instant('alerts.error'), r.error);
      else await this.loadDocument();
    } finally { this.loadingService.hide(); }
  }

  async restoreDocument() {
    this.loadingService.show(this.translate.instant('common.updating'));
    try {
      const r = await this.apiService.documentSetState(this.id(), 1);
      if (r?.error) this.alertService.info(this.translate.instant('alerts.error'), r.error);
      else await this.loadDocument();
    } finally { this.loadingService.hide(); }
  }

  async shareWithNew() {
    const account = await this.shareModal.show();
    if (!account) return;
    this.loadingService.show(this.translate.instant('documents.shareModal.sharing'));
    try {
      const r = await this.apiService.documentShare(this.id(), account);
      if (r?.error) this.alertService.info(this.translate.instant('alerts.error'), r.error);
      else await this.loadShared();
    } finally { this.loadingService.hide(); }
  }

  async unshare(account: string) {
    if (!(await this.alertService.show(this.translate.instant('documents.details.confirm.revokeTitle'), this.translate.instant('documents.details.confirm.revokeMessage', { account }), this.translate.instant('documents.details.actions.revoke')))) return;
    this.loadingService.show(this.translate.instant('common.updating'));
    try {
      const r = await this.apiService.documentUnshare(this.id(), account);
      if (r?.error) this.alertService.info(this.translate.instant('alerts.error'), r.error);
      else await this.loadShared();
    } finally { this.loadingService.hide(); }
  }

  // Fetches the decrypted file bytes via the streaming endpoint. The API does all crypto (Public
  // plaintext passthrough; Private - unwrap DEK + AES-GCM decrypt), so the frontend just gets raw
  // bytes back. Returns null on failure (alert already shown).
  private async _fetchFileBytes(): Promise<ArrayBuffer | null> {
    const fetched = await this.apiService.documentFetchFile(this.id());
    if (!fetched) {
      this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('documents.details.errors.fetchFile'));
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
    this.loadingService.show(this.translate.instant('documents.details.loading.hashingSigning'));
    try {
      const buf = await this._fetchFileBytes();
      if (!buf) return;
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const docHash = '0x' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');

      const signRes = await this.apiService.documentSign(this.id(), keyId, docHash);
      // authPost returns null on any non-2xx (e.g. a 403 from requireExecutive) — null is a failure,
      // not a silent success.
      if (!signRes || signRes.error) {
        this.alertService.info(this.translate.instant('alerts.error'), signRes?.error || this.translate.instant('documents.details.errors.signFailed'));
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
    this.loadingService.show(this.translate.instant('documents.details.loading.verifyingSignature'));
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
        ok ? this.translate.instant('documents.details.verify.valid') : this.translate.instant('documents.details.verify.invalid'),
        '',
        this.translate.instant('documents.details.verify.signerExpectedLabel') + sig.signer,
        this.translate.instant('documents.details.verify.signerRecoveredLabel') + (recovered || '—'),
        this.translate.instant('documents.details.verify.hashAttestedLabel') + sig.docHash,
        this.translate.instant('documents.details.verify.hashCurrentLabel') + currentHash,
        '',
        hashMatches ? this.translate.instant('documents.details.verify.hashMatches') : this.translate.instant('documents.details.verify.hashMismatch'),
        signerMatches ? this.translate.instant('documents.details.verify.signerMatches') : this.translate.instant('documents.details.verify.signerMismatch'),
      ];
      this.alertService.info(ok ? this.translate.instant('documents.details.verify.validTitle') : this.translate.instant('documents.details.verify.invalidTitle'), lines.join('\n'));
    } finally { this.loadingService.hide(); }
  }

  async viewFile() {
    const doc = this.document();
    if (!doc?.cid) return;
    this.loadingService.show(this.translate.instant('documents.details.loading.fetchingFile'));
    try {
      const fetched = await this.apiService.documentFetchFile(this.id());
      if (!fetched) {
        this.alertService.info(this.translate.instant('alerts.error'), this.translate.instant('documents.details.errors.fetchFile'));
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
    if (doc.documentType !== 2 && doc.documentType !== 3) {
      this.alertService.info(this.translate.instant('documents.details.publish.notApplicableTitle'), this.translate.instant('documents.details.publish.notApplicableMessage'));
      return;
    }
    const ok = await this.alertService.show(
      this.translate.instant('documents.details.publish.title'),
      this.translate.instant('documents.details.publish.body'),
      this.translate.instant('documents.actions.publish')
    );
    if (!ok) return;
    this.loadingService.show(this.translate.instant('documents.details.publish.publishing'));
    try {
      const r = await this.apiService.documentPublish(this.id());
      if (r?.error) this.alertService.info(this.translate.instant('alerts.error'), r.error);
      else await this.loadAll();
    } finally {
      this.loadingService.hide();
    }
  }

}
