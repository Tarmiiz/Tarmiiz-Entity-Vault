/**
 * Party Class — the ONE numbering shared by `Service.partyClass`, `ServicePartiesLib`'s
 * on-chain role ids, `service_parties.party_type`, the curated set's `spType`, and every
 * rules-matrix `classId`. One enum, no translation anywhere.
 *
 * ⚠️ THESE IDS RENUMBERED and the old ones are still VALID VALUES, so a stale literal does not
 * error — it silently names a DIFFERENT party family. The payment rail split into two TYPES
 * (a gateway and a bank are different kinds of party, not two levels of one), which inserted
 * Bank at 3 and pushed Custodian 3 -> 4 and Clearing House 4 -> 5. Every hardcoded `3` written
 * before that split now means Bank.
 *
 * That is exactly how a custodian attach reached the chain asking "is this a Bank?", got a
 * truthful no, and surfaced as an unexplained revert. Import from here; never write the digit.
 *
 * The catalog is APPEND-ONLY and runtime-extensible on chain (ids 7..18 are reserved for the
 * minters' CH, the rate authority, the asset-attached roles and the OCS operator classes), so
 * nothing here may assume a closed set — test membership, never a range.
 *
 * Server twin: `PARTY_CLASS` in the Entity API's `src/services/db.js` (and the Regulator API's).
 * Keep the three literally in step.
 */
export const PARTY_CLASS = {
  // 1..6 — ATTACH_SERVICE: what attaches to a SERVICE
  VALIDATOR:           1,
  PAYMENT_GATEWAY:     2,   // the rail as a TYPE
  BANK:                3,   // the other rail TYPE; an institution offering both registers TWICE
  CUSTODIAN:           4,
  CLEARING_HOUSE:      5,   // the ENTITIES' clearing house
  ESCROW_CH:           6,   // the VENUE's escrow CH — a SEPARATE appointment from both others
  // 7..8 — jurisdiction-level appointments; they attach to NOTHING
  MINTERS_CH:          7,
  RATE_AUTHORITY:      8,
  // 9..14 + 19 — ATTACH_ASSET: the A2 class-required party roles on an ASSET
  APPRAISER:           9,
  AUDITOR:            10,
  SHARIA_ADVISOR:     11,
  VAULT_CUSTODIAN:    12,
  REGISTRY_LINK:      13,
  SERVICER:           14,
  // 15..18 — operator classes, held by a CONTRACT or an EOA, never declared by a service
  MARKET_OPERATOR:    15,
  SETTLEMENT_OPERATOR:16,
  COMMS_OPERATOR:     17,
  IDENTITY_ISSUER:    18,
  // 19 — APPENDED rather than inserted at 15, so no existing id moved. Inserting would have
  // shifted IDENTITY_ISSUER to 19 and silently re-pointed the Identities Registry's hardcoded
  // CLASS_IDENTITY_ISSUER onto COMMS_OPERATOR.
  CONSULTANT:         19,
} as const;

// ── THREE BANDS, THREE QUESTIONS ───────────────────────────────────────────────────────────
//
// `PARTY_CLASS_IDS` used to be "every ATTACHABLE class id" and was every id there was, because
// ATTACH_SERVICE was the only band that existed. Those are now three different answers, and the
// old name would silently mean the widest of them.
//
// Sets, never ranges: `id >= 1 && id <= N` is already wrong for the asset band (19 is not
// contiguous with 9..14) and would be wrong QUIETLY.
export const ATTACH_SERVICE_CLASSES: readonly number[] = [
  PARTY_CLASS.VALIDATOR, PARTY_CLASS.PAYMENT_GATEWAY, PARTY_CLASS.BANK,
  PARTY_CLASS.CUSTODIAN, PARTY_CLASS.CLEARING_HOUSE, PARTY_CLASS.ESCROW_CH,
];
export const ATTACH_ASSET_CLASSES: readonly number[] = [
  PARTY_CLASS.APPRAISER, PARTY_CLASS.AUDITOR, PARTY_CLASS.SHARIA_ADVISOR,
  PARTY_CLASS.VAULT_CUSTODIAN, PARTY_CLASS.REGISTRY_LINK, PARTY_CLASS.SERVICER,
  PARTY_CLASS.CONSULTANT,
];
export const OPERATOR_CLASSES: readonly number[] = [
  PARTY_CLASS.MARKET_OPERATOR, PARTY_CLASS.SETTLEMENT_OPERATOR,
  PARTY_CLASS.COMMS_OPERATOR, PARTY_CLASS.IDENTITY_ISSUER,
];
/** What a type-2 service may DECLARE — everything but the operator classes. */
export const DECLARABLE_CLASSES: readonly number[] =
  Object.values(PARTY_CLASS).filter((id) => !OPERATOR_CLASSES.includes(id));

/**
 * @deprecated Ambiguous since three bands exist — say WHICH attachment you mean.
 * Retained pointing at the SERVICE band, which is what every existing caller meant.
 */
export const PARTY_CLASS_IDS: readonly number[] = ATTACH_SERVICE_CLASSES;

/**
 * Display names. These are the CANONICAL names — "Payment Processor" is retired vocabulary
 * that now spans two distinct classes (2 and 3), so it can no longer name either of them.
 */
export const PARTY_CLASS_NAME: Record<number, string> = {
  [PARTY_CLASS.VALIDATOR]:           'Validator',
  [PARTY_CLASS.PAYMENT_GATEWAY]:     'Payment Gateway',
  [PARTY_CLASS.BANK]:                'Bank',
  [PARTY_CLASS.CUSTODIAN]:           'Custodian',
  [PARTY_CLASS.CLEARING_HOUSE]:      'Clearing House',
  [PARTY_CLASS.ESCROW_CH]:           'Escrow Clearing House',
  [PARTY_CLASS.MINTERS_CH]:          'Minters Clearing House',
  [PARTY_CLASS.RATE_AUTHORITY]:      'Rate Authority',
  [PARTY_CLASS.APPRAISER]:           'Appraiser',
  [PARTY_CLASS.AUDITOR]:             'Auditor / Reviewer',
  [PARTY_CLASS.SHARIA_ADVISOR]:      'Sharia Advisor',
  [PARTY_CLASS.VAULT_CUSTODIAN]:     'Vault Custodian',
  [PARTY_CLASS.REGISTRY_LINK]:       'Registry Link',
  [PARTY_CLASS.SERVICER]:            'Servicer',
  [PARTY_CLASS.MARKET_OPERATOR]:     'Market Operator',
  [PARTY_CLASS.SETTLEMENT_OPERATOR]: 'Settlement Operator',
  [PARTY_CLASS.COMMS_OPERATOR]:      'Comms Operator',
  [PARTY_CLASS.IDENTITY_ISSUER]:     'Identity Issuer',
  [PARTY_CLASS.CONSULTANT]:          'Consultant',
};

/** Falls back to the raw id rather than a wrong name — an unknown class is a fact, not 'Other'. */
export function partyClassName(id: number | null | undefined): string {
  return PARTY_CLASS_NAME[Number(id)] ?? (id ? `Class ${id}` : '');
}

/** One attached party in a service's provider set. */
export interface ServiceParty {
  address: string;
  active: boolean;
}

/**
 * A service's attached providers grouped by role.
 *
 * `paymentProcessors` deliberately collects BOTH rail classes (gateway + bank) — every consumer
 * asks one question, "who can process a payment for this service". `escrowClearingHouses` is
 * deliberately NOT merged into `clearingHouses` for the opposite reason: it is a separate
 * appointment, and the replace-over-1:N helper detaches every other member of the bucket it
 * reads, so conflating them would tear down a venue's escrow arrangement as a side effect of
 * reassigning a clearing house.
 */
export interface ServiceParties {
  validators:           ServiceParty[];
  paymentProcessors:    ServiceParty[];
  custodians:           ServiceParty[];
  clearingHouses:       ServiceParty[];
  escrowClearingHouses: ServiceParty[];
}
