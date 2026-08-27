/**
 * Market Class — the sub-type vocabulary of a **type-1 service (Token Provider)**, the exact
 * counterpart of `party-class.ts` on the other half of the `serviceType` axis.
 *
 * `Service` carries TWO sub-type fields and exactly one is non-zero, always:
 *
 *     partyClass  != 0  ⟺  serviceType == 2      (catalog: `Party Class`)
 *     marketClass != 0  ⟺  serviceType == 1      (catalog: `Market Class`, here)
 *
 * That self-identification is why they are two fields rather than one generic `subType`: under
 * one field, `subType == 2` means "Payment Gateway" or "Exchange" depending on a NEIGHBOURING
 * field, and every reader that forgets to check it mis-classifies silently.
 *
 * ⚠️ `0` is never legal on a type-1 service. There is no unclassified token provider, the same
 * way there is no unclassified service provider — so a `marketClass` of 0 on a type-1 row is a
 * pipeline fault to surface, not a default to paper over.
 *
 * ⚠️ THIS IS NOT `Entity Mode` AND NOTHING DERIVES ONE FROM THE OTHER. Entity Mode (off-chain,
 * `app_config.VAULT_MODE`) is a per-TENANT menu choice; this is a per-SERVICE on-chain fact.
 * They share three words — Issuer / Exchange / Brokerage — and may legitimately disagree: a
 * mode-1 tenant running one Issuer service and one Exchange service is normal. Never default a
 * declared `marketClass` from `features.vaultMode`.
 *
 * ⚠️ Nor is it `Venue.settlementMode` (DEX), which answers *how does this book settle* about a
 * VENUE ROW. An Exchange may run a mode-1 or a mode-2 venue and neither derives the other.
 *
 * The catalog is APPEND-ONLY on chain, so nothing here may assume a closed set — test
 * membership, never a range.
 *
 * Solidity twin: the `MC_*` file-level constants in the Entities Registry's
 * `contracts/interfaces/templates/IServiceTemplate.sol` (the canonical home).
 * Server twin: `MARKET_CLASS` in the Entity API's `src/services/db.js`.
 * Keep the three literally in step.
 */
export const MARKET_CLASS = {
  ISSUER:    1,   // issues its own assets (primary market)
  EXCHANGE:  2,   // operates a DEX venue (hosts other issuers' listings)
  BROKERAGE: 3,   // trades on OTHER venues for its clients
} as const;

/** Every market class id, for membership tests (never `id >= 1 && id <= 3`). */
export const MARKET_CLASS_IDS: readonly number[] = Object.values(MARKET_CLASS);

export const MARKET_CLASS_NAME: Record<number, string> = {
  [MARKET_CLASS.ISSUER]:    'Issuer',
  [MARKET_CLASS.EXCHANGE]:  'Exchange',
  [MARKET_CLASS.BROKERAGE]: 'Brokerage',
};

/** Falls back to the raw id rather than a wrong name — an unknown class is a fact, not 'Other'. */
export function marketClassName(id: number | null | undefined): string {
  return MARKET_CLASS_NAME[Number(id)] ?? (id ? `Class ${id}` : '');
}
