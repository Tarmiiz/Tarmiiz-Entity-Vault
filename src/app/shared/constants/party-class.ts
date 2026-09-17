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
// 🔴 REBUILT 2026-09-04 (Phase 4.9) — EVERY ID FROM 7 UP WAS WRONG, AND SILENTLY SO.
// 4.9 INSERTED Depositary(7) and Fund Administrator(8) — they appoint per FUND, so they attach to
// the SERVICE — which shifted everything above them by two. This file still held the pre-4.9
// numbering, so `APPRAISER: 9` named what is now **Minters Clearing House**, `SHARIA_ADVISOR: 11`
// named **Valuer**, and `IDENTITY_ISSUER: 18` named **Legal Opinion Provider**. A picker filtered
// on any of these returned a full, plausible list of the WRONG PROFESSION — no error, no gap.
//
// ⚠️ `check-party-class.js` REPORTED "Entity Vault party-class.ts matches the chain" THROUGHOUT,
// and was not lying — its ALIAS map holds six keys (VALIDATOR, PAYMENT_GATEWAY, BANK, CUSTODIAN,
// CLEARING, ESCROW_CH) and it compares only those. The six it checked did agree. Everything above
// 6 was never compared, so the message overstated its own scope: "matches the chain" reads as
// "this file is correct" and meant "the six names I know about agree". §10 of that checker now
// covers the asset band; the operator and license bands are still name-checked nowhere.
export const PARTY_CLASS = {
  // 1..8 — ATTACH_SERVICE: what attaches to a SERVICE. CONTIGUOUS since 4.9 inserted 7 and 8
  // into this band deliberately, so the range check is a plain `<= 8` rather than a disjunct.
  VALIDATOR:           1,
  PAYMENT_GATEWAY:     2,   // the rail as a TYPE
  BANK:                3,   // the other rail TYPE; an institution offering both registers TWICE
  CUSTODIAN:           4,
  CLEARING_HOUSE:      5,   // the ENTITIES' clearing house
  ESCROW_CH:           6,   // the VENUE's escrow CH — a SEPARATE appointment from both others
  DEPOSITARY:          7,   // AIFMD Art 21 appoints per FUND — a service, not an asset
  FUND_ADMINISTRATOR:  8,   // NAV agent, likewise per fund
  // 9..10 — jurisdiction-level appointments; they attach to NOTHING
  MINTERS_CH:          9,
  RATE_AUTHORITY:     10,
  // 11..22 — ATTACH_ASSET: the twelve base asset roles, 1:1 with AssetClassLib.ROLE_* via
  // `partyClassForRole`. Now CONTIGUOUS — the old band was 9..14 + 19 because Consultant had been
  // appended rather than inserted; 4.9 renamed it Independent Engineer and closed the gap.
  VALUER:             11,   // was APPRAISER
  STATUTORY_AUDITOR:  12,   // was AUDITOR
  SHARIA_ADVISOR:     13,
  PHYSICAL_CUSTODIAN: 14,   // was VAULT_CUSTODIAN
  REGISTRAR:          15,   // was REGISTRY_LINK
  SERVICER:           16,
  INDEPENDENT_ENGINEER: 17, // was CONSULTANT(19) — the name never matched the role it backed
  LEGAL_OPINION_PROVIDER: 18,
  TRUSTEE:            19,
  CREDIT_RATING_AGENCY: 20,
  INDEPENDENT_EXTERNAL_REVIEWER: 21,
  SPONSOR_LISTING_ADVISER: 22,
  // 23..26 — operator classes, held by a CONTRACT or an EOA, never declared by a service
  MARKET_OPERATOR:    23,
  SETTLEMENT_OPERATOR:24,
  COMMS_OPERATOR:     25,
  IDENTITY_ISSUER:    26,   // verified against IdentitiesProxy.CLASS_IDENTITY_ISSUER = 26
  // 27..29 — LICENSE classes (Phase 28). Not a party a service declares: a license its
  // regulator grants, read through `LicensesProxy.hasLicense`.
  TOKEN_ISSUER:       27,
  EXCHANGE:           28,
  BROKERAGE:          29,
} as const;

// ── THREE BANDS, THREE QUESTIONS ───────────────────────────────────────────────────────────
//
// `PARTY_CLASS_IDS` used to be "every ATTACHABLE class id" and was every id there was, because
// ATTACH_SERVICE was the only band that existed. Those are now three different answers, and the
// old name would silently mean the widest of them.
//
// Sets, never ranges. Both bands happen to be contiguous after 4.9 — but they are still written
// as sets, because that was true of the asset band once before (9..14 + 19) and stopped being
// true QUIETLY. A range check is a claim about future ids that nobody is in a position to make.
export const ATTACH_SERVICE_CLASSES: readonly number[] = [
  PARTY_CLASS.VALIDATOR, PARTY_CLASS.PAYMENT_GATEWAY, PARTY_CLASS.BANK,
  PARTY_CLASS.CUSTODIAN, PARTY_CLASS.CLEARING_HOUSE, PARTY_CLASS.ESCROW_CH,
  PARTY_CLASS.DEPOSITARY, PARTY_CLASS.FUND_ADMINISTRATOR,
];
export const ATTACH_ASSET_CLASSES: readonly number[] = [
  PARTY_CLASS.VALUER, PARTY_CLASS.STATUTORY_AUDITOR, PARTY_CLASS.SHARIA_ADVISOR,
  PARTY_CLASS.PHYSICAL_CUSTODIAN, PARTY_CLASS.REGISTRAR, PARTY_CLASS.SERVICER,
  PARTY_CLASS.INDEPENDENT_ENGINEER, PARTY_CLASS.LEGAL_OPINION_PROVIDER, PARTY_CLASS.TRUSTEE,
  PARTY_CLASS.CREDIT_RATING_AGENCY, PARTY_CLASS.INDEPENDENT_EXTERNAL_REVIEWER,
  PARTY_CLASS.SPONSOR_LISTING_ADVISER,
];
export const OPERATOR_CLASSES: readonly number[] = [
  PARTY_CLASS.MARKET_OPERATOR, PARTY_CLASS.SETTLEMENT_OPERATOR,
  PARTY_CLASS.COMMS_OPERATOR, PARTY_CLASS.IDENTITY_ISSUER,
];
/** License classes (Phase 28) — granted by a regulator, never declared by a service. */
export const LICENSE_CLASSES: readonly number[] = [
  PARTY_CLASS.TOKEN_ISSUER, PARTY_CLASS.EXCHANGE, PARTY_CLASS.BROKERAGE,
];
/**
 * What a type-2 service may DECLARE — everything but the operator AND license classes.
 *
 * ⚠️ THE LICENSE EXCLUSION IS NEW AND LOAD-BEARING. This derives by subtraction from every value
 * in `PARTY_CLASS`, so 27/28/29 became declarable the moment they were added — and a service
 * declaring itself "Token Issuer" as a party class would be asserting a license its regulator
 * grants. Deriving by subtraction is convenient and fails OPEN: every future id is declarable
 * until someone remembers to exclude it.
 */
export const DECLARABLE_CLASSES: readonly number[] =
  Object.values(PARTY_CLASS).filter(
    (id) => !OPERATOR_CLASSES.includes(id) && !LICENSE_CLASSES.includes(id));

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
  [PARTY_CLASS.DEPOSITARY]:          'Depositary',
  [PARTY_CLASS.FUND_ADMINISTRATOR]:  'Fund Administrator',
  [PARTY_CLASS.MINTERS_CH]:          'Minters Clearing House',
  [PARTY_CLASS.RATE_AUTHORITY]:      'Rate Authority',
  [PARTY_CLASS.VALUER]:              'Valuer',
  [PARTY_CLASS.STATUTORY_AUDITOR]:   'Statutory Auditor',
  [PARTY_CLASS.SHARIA_ADVISOR]:      'Sharia Advisor',
  [PARTY_CLASS.PHYSICAL_CUSTODIAN]:  'Physical Custodian',
  [PARTY_CLASS.REGISTRAR]:           'Registrar',
  [PARTY_CLASS.SERVICER]:            'Servicer',
  [PARTY_CLASS.INDEPENDENT_ENGINEER]: 'Independent Engineer',
  [PARTY_CLASS.LEGAL_OPINION_PROVIDER]: 'Legal Opinion Provider',
  [PARTY_CLASS.TRUSTEE]:             'Trustee',
  [PARTY_CLASS.CREDIT_RATING_AGENCY]: 'Credit Rating Agency',
  [PARTY_CLASS.INDEPENDENT_EXTERNAL_REVIEWER]: 'Independent External Reviewer',
  [PARTY_CLASS.SPONSOR_LISTING_ADVISER]: 'Sponsor / Listing Adviser',
  [PARTY_CLASS.MARKET_OPERATOR]:     'Market Operator',
  [PARTY_CLASS.SETTLEMENT_OPERATOR]: 'Settlement Operator',
  [PARTY_CLASS.COMMS_OPERATOR]:      'Comms Operator',
  [PARTY_CLASS.IDENTITY_ISSUER]:     'Identity Issuer',
  [PARTY_CLASS.TOKEN_ISSUER]:        'Token Issuer',
  [PARTY_CLASS.EXCHANGE]:            'Exchange',
  [PARTY_CLASS.BROKERAGE]:           'Brokerage',
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
  /** Phase 4.9's fund-level appointments (7 / 8) — served by the API since 2026-09-17 (Phase 36 A.1). */
  depositaries:         ServiceParty[];
  fundAdministrators:   ServiceParty[];
}
