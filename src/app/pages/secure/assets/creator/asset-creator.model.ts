// asset-creator.model.ts — the wizard's data shapes. Until 2026-09-10 this file was
// `modal-asset-add.service.ts` and also carried the modal's show/confirm/cancel promise
// service; the Asset Creator is a routed PAGE now (R18 / Standard 2.5), so only the
// interfaces survive — the page performs the create itself.

// Attachment collected in the wizard's Documents step — uploaded AFTER the asset is
// created (docs attach to the asset address, which doesn't exist until create returns).
export interface WizardDocFile {
  file: File;
  title: string;
  description: string;
  documentType: number; // 1 = Public, 2 = Private (entity-only at creation)
}

// Images step row — same pipeline as documents plus a media role. Avatar/banner are
// public-only (they land in the asset's public metadata `media` index).
export interface WizardImageFile extends WizardDocFile {
  role: 'avatar' | 'banner' | 'gallery';
  previewUrl: string;
}

export interface AddAssetData {
  owner: string;
  issuer: string;
  manager: string;
  name: string;
  symbol: string;
  description: string;
  service: string;
  currency: number;
  // DERIVED from `formula` since 4.9 — the regulator that authored the chosen class formula
  // IS the asset's regulator, which is the pairing `registerAsset` enforces on chain.
  regulator: string;
  // 4.9 — the address of one of that regulator's ACTIVE class formula contracts ("Green
  // Sukuk", "Conventional REIT"). REQUIRED, with no default: it carries the supply policy,
  // price-mode policy, requirement rows, permitted standards and parameters, and
  // `registerAsset` refuses without it. That refusal is the whole fail-closed argument now —
  // `AssetClassLib`'s class → supply map, per-row defaults and independence rules are all
  // DELETED, so an unset requirement row demands nothing.
  formula: string;
  // supplyMode: 1 = Fixed (initialSupply minted to contract at init), 2 = Dynamic (mint on subscribe).
  // ⚠️ Both of these are the FORMULA's policy unless it is 3 (Issuer chooses) — no longer a
  // property of the class. Two products over the same base class may legitimately differ.
  supplyMode: number;
  priceMode: number;
  // The A1 BASE class 1..11. IMMUTABLE on the token, but since 4.9 it is mechanics
  // vocabulary that fixes NOTHING on its own — derived from the formula, sent so
  // `registerAsset` can check the token's declaration against the formula's base class.
  assetClass: number;
  initialSupply?: number;
  // ERC-20 `decimals`, stored VERBATIM on the token. 0 is the platform default and the correct
  // value for every asset whose quantities are plain integers (all four FRA funds, Phase 36
  // ruling D4: whole units, round down, residue carried as cash). Non-zero only for an issuer
  // that genuinely scales its quantities. The API accepted it since 2026-07-30; the wizard
  // never sent it until 2026-09-17 (A.2), so it was unreachable from the UI.
  decimals: number;
  creditSettlement: boolean;
  customMetadata: Record<string, string>;
  // Security identifiers (ISIN, …) for the metadata's server-owned `identifiers` key. Empty
  // when none was typed — an ISIN is often assigned after issuance, so it is optional here
  // and the asset details page is the primary place to record it.
  identifiers: { idType: number; name: string; value: string }[];
  // Optional attachments — uploaded post-create by the list page (documents first, then images).
  documents: WizardDocFile[];
  images: WizardImageFile[];
}
