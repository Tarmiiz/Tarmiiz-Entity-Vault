import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ethers } from 'ethers';

import { HeaderComponent } from '../../../../shared/components/header/header.component';
import { ApiService } from '../../../../shared/services/api.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { LoadingService } from '../../../../shared/components/alerts/loading/loading.service';
import { AlertService } from '../../../../shared/components/alerts/alert/alert.service';
import { UtilsService } from '../../../../shared/services/utils.service';
import { ModalDocumentSignService } from '../modals/modal-document-sign/modal-document-sign.service';
import { ModalDocumentSignComponent } from '../modals/modal-document-sign/modal-document-sign.component';

import { Document, DocumentSignature, DocumentVersion } from '../../../../shared/models/data.model';

const DOC_TYPE_PRIVATE = 2;
// DirectoryProxy party types (NOT the Connect convention): 2=Entity, 3=Regulator, 4=Service.
const DIR_PARTY_REGULATOR = 3;

// Read-only details for a document another tenant (e.g. a regulator) shared with this entity.
// Shows the full metadata (incl. description) + a View File action — unlike the bare file-open
// the "Shared with me" list used to do. The doc lives on the OWNER's template; reads go through
// the cross-tenant endpoints (GET /documents/shared/:owner/:id[/file]).
@Component({
  selector: 'app-documents-shared-details',
  templateUrl: './shared-details.page.html',
  styleUrls: ['./shared-details.page.scss'],
  standalone: true,
  imports: [RouterLink, HeaderComponent, ModalDocumentSignComponent, TranslatePipe]
})
export class SharedDetailsPage implements OnInit {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private loadingService = inject(LoadingService);
  private alertService = inject(AlertService);
  private signModal = inject(ModalDocumentSignService);
  private translate = inject(TranslateService);
  utils = inject(UtilsService);

  // Only executive (role 2) users hold signer keys; signing a regulator's document submits a
  // signature back to the regulator (RegulatorTemplate.submitSignature, onlyRegisteredEntity), so
  // it only applies when the owner is a regulator.
  isExecutive = () => Number(this.authService.userInfo?.role) === 2;

  ownerAddress = signal<string>('');
  id = signal<string>('');
  document = signal<Document | null>(null);
  signatureCount = signal<number>(0);
  // ALL signatures on the shared doc (the central registry's signature reads admit
  // recipients), each enriched with reviewStateName — so the recipient can verify the
  // sender's signature and see the review verdict.
  signatures = signal<DocumentSignature[]>([]);
  versions = signal<DocumentVersion[]>([]);
  // This entity's own signature on the doc (read from getSubmissionsByEntity), if it has signed.
  mySignature = signal<{ signer: string; signedAt: number } | null>(null);

  ownerName = signal<string>('');
  ownerPartyType = signal<number>(0);

  docTypes = signal<{ id: number; name: string }[]>([]);
  docStates = signal<{ id: number; name: string }[]>([]);
  reviewStates = signal<{ id: number; name: string }[]>([]);

  isPrivate = computed(() => this.document()?.documentType === DOC_TYPE_PRIVATE);

  // Signing only makes sense when the owner is a regulator (submitSignature targets a RegulatorTemplate),
  // the doc is active, and the current user is an executive (holds signer keys).
  canSign = computed(() =>
    this.ownerPartyType() === DIR_PARTY_REGULATOR &&
    this.document()?.documentState === 1 &&
    this.isExecutive() &&
    !this.mySignature()
  );

  ngOnInit(): void {
    this.ownerAddress.set(this.route.snapshot.paramMap.get('owner') || '');
    this.id.set(this.route.snapshot.paramMap.get('id') || '');
  }

  async ionViewDidEnter() {
    await Promise.all([this.loadDocument(), this.loadGlobals(), this.loadOwner(), this.loadMySubmission(), this.loadSignatures(), this.loadVersions()]);
  }

  // Upload ledger for a foreign-owned doc — read chain-first from the owner's space (the central
  // read gate admits us as a recipient). The file metadata columns come back null: only the
  // OWNER's API ever saw the uploaded filename and bytes.
  async loadVersions() {
    try {
      const r = await this.apiService.documentSharedVersions(this.ownerAddress(), this.id(), 1, 200);
      if (r?.versions) this.versions.set(r.versions as DocumentVersion[]);
    } catch { /* best effort — the section stays empty */ }
  }

  formatBytes(bytes: number | null): string {
    if (bytes === null || bytes === undefined) return '—';
    if (bytes < 1024) return bytes + ' B';
    const units = ['KB', 'MB', 'GB'];
    let v = bytes / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(1) + ' ' + units[i];
  }

  truncate(value: string | null, lead = 10, tail = 6): string {
    if (!value) return '—';
    return value.length <= lead + tail + 1 ? value : value.slice(0, lead) + '…' + value.slice(-tail);
  }

  async copyToClipboard(value: string | null) {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); } catch { /* clipboard unavailable */ }
  }

  // Recipient-facing signature read (GET /documents/shared/:owner/:id/signatures) — the
  // DocumentsProxy signature reads pass for writer OR recipient OR controller-of-recipient.
  async loadSignatures() {
    try {
      const r = await this.apiService.documentSharedSignatures(this.ownerAddress(), this.id(), 1, 100);
      if (r?.signatures) {
        this.signatures.set(r.signatures as DocumentSignature[]);
        this.signatureCount.set(Number(r.count ?? r.signatures.length));
      }
    } catch { /* best effort — the count from sharedGet remains */ }
  }

  // Read this entity's own submissions to the owner (getSubmissionsByEntity) and surface whether it
  // has already signed THIS document. Owner-side signature reads are owner-gated, so the entity can
  // only see its own submission — that's enough for a "Signed by you" indicator + to hide re-signing.
  async loadMySubmission() {
    try {
      const r = await this.apiService.regulatorSubmissionsList(this.ownerAddress(), 1, 200);
      const sigs = (r?.signatures ?? []) as any[];
      const mine = sigs.find(s => Number(s.documentId) === Number(this.id()));
      this.mySignature.set(mine ? { signer: mine.signer, signedAt: Number(mine.signedAt || 0) } : null);
    } catch {
      this.mySignature.set(null);
    }
  }

  async loadGlobals() {
    const [typesRes, statesRes, reviewRes] = await Promise.all([
      this.apiService.vaultGetGlobalVariablesList('Document Type'),
      this.apiService.vaultGetGlobalVariablesList('Document State'),
      this.apiService.vaultGetGlobalVariablesList('Document Review State'),
    ]);
    const map = (rows: any[]) => (rows || []).map(v => ({ id: Number(v.variable_id), name: v.name }));
    if (typesRes?.variables)  this.docTypes.set(map(typesRes.variables));
    if (statesRes?.variables) this.docStates.set(map(statesRes.variables));
    if (reviewRes?.variables) this.reviewStates.set(map(reviewRes.variables));
  }

  async loadOwner() {
    try {
      const r = await this.apiService.directoryByAddress(this.ownerAddress());
      if (r?.entry?.name) {
        this.ownerName.set(r.entry.name);
        this.ownerPartyType.set(Number(r.entry.partyType || 0));
      }
    } catch { /* not in directory — fall back to raw address */ }
  }

  partyTypeLabel(t: number): string {
    // DirectoryProxy convention: 2=Entity, 3=Regulator, 4=Service.
    switch (t) {
      case 2: return this.translate.instant('partyType.entity');
      case 3: return this.translate.instant('partyType.regulator');
      case 4: return this.translate.instant('partyType.service');
      default: return '';
    }
  }

  async loadDocument() {
    this.loadingService.show(this.translate.instant('documents.details.loading.document'));
    try {
      const r = await this.apiService.documentSharedGet(this.ownerAddress(), this.id());
      if (r?.document) {
        // Cross-tenant read returns the raw on-chain shape (documentId/lastModified/addedBy);
        // normalize to the Document model used everywhere else (id/updatedAt/owner).
        const d = r.document;
        this.document.set({
          id:              Number(d.documentId ?? d.id),
          cid:             d.cid,
          title:           d.title,
          description:     d.description,
          fileType:        d.fileType,
          documentType:    Number(d.documentType),
          documentState:   Number(d.documentState),
          owner:           d.addedBy ?? d.owner ?? this.ownerAddress(),
          createdByUserId: Number(d.createdByUserId ?? 0),
          createdAt:       Number(d.createdAt ?? 0),
          updatedAt:       Number(d.lastModified ?? d.updatedAt ?? 0),
        } as Document);
      }
      if (r?.signatureCount !== undefined) this.signatureCount.set(Number(r.signatureCount));
      if (r?.error) this.alertService.show(this.translate.instant('alerts.error'), r.error);
    } finally {
      this.loadingService.hide();
    }
  }

  typeLabel(t?: number): string {
    return this.docTypes().find(v => v.id === t)?.name
      || (t === 1 ? this.translate.instant('documents.type.public')
        : t === 2 ? this.translate.instant('documents.type.private')
        : t === 3 ? this.translate.instant('documents.type.internal')
        : String(t ?? ''));
  }
  reviewStateLabel(s?: number): string {
    return this.reviewStates().find(v => v.id === s)?.name || String(s ?? '');
  }
  stateLabel(s?: number): string {
    return this.docStates().find(v => v.id === s)?.name || (s === 1 ? this.translate.instant('documents.docState.active') : s === 2 ? this.translate.instant('documents.docState.deleted') : String(s ?? ''));
  }
  stateClass(s?: number): string {
    switch (s) {
      case 1: return 'bg-green-100 text-green-800';
      case 2: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  async viewFile() {
    this.loadingService.show(this.translate.instant('documents.details.loading.fetchingFile'));
    try {
      const r = await this.apiService.documentFetchSharedFile(this.ownerAddress(), this.id());
      if (!r?.blobUrl) {
        this.alertService.show(this.translate.instant('alerts.error'), this.translate.instant('documents.sharedDetails.errors.fetchFile'));
        return;
      }
      window.open(r.blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(r.blobUrl), 60_000);
    } finally {
      this.loadingService.hide();
    }
  }

  // Fetches the decrypted plaintext bytes of the shared doc (the API does all crypto cross-tenant).
  private async _fetchSharedFileBytes(): Promise<ArrayBuffer | null> {
    const fetched = await this.apiService.documentFetchSharedFile(this.ownerAddress(), this.id());
    if (!fetched?.blobUrl) {
      this.alertService.show(this.translate.instant('alerts.error'), this.translate.instant('documents.sharedDetails.errors.fetchFile'));
      return null;
    }
    try {
      const res = await fetch(fetched.blobUrl);
      return await res.arrayBuffer();
    } finally {
      URL.revokeObjectURL(fetched.blobUrl);
    }
  }

  // Verify a signature on the shared doc: re-hash the decrypted plaintext, recover the signer
  // from the 65-byte EIP-191 signature, and compare both against the attested values.
  async verifySignature(sig: DocumentSignature) {
    this.loadingService.show(this.translate.instant('documents.details.loading.verifyingSignature'));
    try {
      const buf = await this._fetchSharedFileBytes();
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
      this.alertService.show(ok ? this.translate.instant('documents.details.verify.validTitle') : this.translate.instant('documents.details.verify.invalidTitle'), lines.join('\n'));
    } finally { this.loadingService.hide(); }
  }

  // Sign a regulator's shared document: hash the plaintext (SHA-256, same as My Documents) and submit
  // the signature back to the regulator via the entity's signer key (POST /regulator/documents/:id/sign
  // → RegulatorTemplate.submitSignature relayed through EntityTemplate.callExternal).
  async signDocument() {
    if (!this.canSign()) return;
    const keyId = await this.signModal.show();
    if (keyId === null) return;
    this.loadingService.show(this.translate.instant('documents.details.loading.hashingSigning'));
    try {
      const buf = await this._fetchSharedFileBytes();
      if (!buf) return;
      const digest  = await crypto.subtle.digest('SHA-256', buf);
      const docHash = '0x' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');

      const r = await this.apiService.regulatorDocumentSign(this.id(), this.ownerAddress(), String(keyId), docHash, this.document()?.title || '');
      // authPost returns null on any non-2xx (e.g. 403) — treat null OR an error body as failure
      // so we never show a false "signed" confirmation.
      if (!r || r.error) {
        this.alertService.show(this.translate.instant('documents.sharedDetails.signFailedTitle'), r?.error || this.translate.instant('documents.sharedDetails.signFailedMessage'), this.translate.instant('alerts.ok'), 'max-w-md', true);
        return;
      }
      this.alertService.show(this.translate.instant('documents.sharedDetails.signedTitle'), this.translate.instant('documents.sharedDetails.signedMessage'), this.translate.instant('alerts.ok'), 'max-w-md', true);
      // Reflect the new signature (hides the Sign button + shows the "Signed by you" indicator).
      await Promise.all([this.loadMySubmission(), this.loadSignatures()]);
    } finally {
      this.loadingService.hide();
    }
  }
}
