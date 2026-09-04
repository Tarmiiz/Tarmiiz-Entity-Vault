// ekyc-canonical.ts — GENERATED mirror of the platform canonical identity schema.
// Source: Tarmiiz Plugin eKYC/Services/eKYC API/src/canonical/ekyc-canonical.schema.json (v4).
// DO NOT EDIT BY HAND — regenerate with `node scripts/gen-canonical-ts.js` in the eKYC Service repo.
// Drift vs the schema is reported by d:\Code\Products\scripts\check-canonical-sync.ps1.

export const EKYC_CANONICAL_SCHEMA_VERSION = 4;

/** Numeric values of the Global Variables 'ID Type - Individual' category. */
export const EKYC_ID_TYPES: Record<number, string> = {"1":"National ID","2":"Passport","3":"Driver License"};

/** Every caller-suppliable identity field, in canonical storage order. */
export const EKYC_IDENTITY_FIELDS = ["nameFirst","nameLast","nameFull","gender","dateOfBirth","maritalStatus","religion","profession","husbandName","nationalId","nationalIdSerial","idReleaseDate","idExpiryDate","addressStreet","addressDistrict","addressGovernorate","birthGovernorate","idType","idNumber","issuingCountry","issuingAuthority","nationality","placeOfBirth","addressCity","addressPostalCode","addressCountry"] as const;

/** Assurance tier of a canonical field.
 *  'M' = mandatory for every document type · 'O' = optional (a scope over it may be empty)
 *  { C: [idTypes] } = CONDITIONAL — mandatory only for those document types. */
export type EkycFieldRule = 'M' | 'O' | { C: readonly number[] };

/** The minimum data points, in one table. Mirror of ekycCanonical.FIELD_RULES.
 *  The three NAME fields are 'O' here because the real requirement is the PAIR RULE
 *  (nameFull OR nameFirst+nameLast), enforced server-side. */
export const EKYC_FIELD_RULES: Record<string, EkycFieldRule> = {"idType":"M","idNumber":"M","issuingCountry":"M","idExpiryDate":"M","idReleaseDate":{"C":[1,2]},"issuingAuthority":{"C":[2]},"nationalIdSerial":"O","nationalId":"O","dateOfBirth":"M","nationality":"M","gender":{"C":[1,2]},"placeOfBirth":{"C":[2]},"nameFirst":"O","nameLast":"O","nameFull":"O","maritalStatus":"O","religion":"O","profession":"O","husbandName":"O","birthGovernorate":"O","addressCountry":"M","addressStreet":{"C":[1]},"addressCity":"O","addressGovernorate":"O","addressDistrict":"O","addressPostalCode":"O"};

/** Required document images. Mirror of ekycCanonical.EVIDENCE_RULES. NOT canonical
 *  fields — they travel beside the canonical and are pinned into the document. */
export const EKYC_EVIDENCE_RULES: Record<string, EkycFieldRule> = {"idFront":"M","idBack":{"C":[1,3]}};

/** Display labels per canonical field. */
export const EKYC_FIELD_LABELS: Record<string, string> = {"idType":"ID Type","idNumber":"Document Number","nationalId":"National ID","nationalIdSerial":"ID Serial Number","idReleaseDate":"ID Release Date","idExpiryDate":"ID Expiry Date","issuingCountry":"Issuing Country","issuingAuthority":"Issuing Authority","nameFirst":"First Name","nameLast":"Last Name(s)","nameFull":"Full Name","gender":"Gender","dateOfBirth":"Date of Birth","nationality":"Nationality","placeOfBirth":"Place of Birth","maritalStatus":"Marital Status","religion":"Religion","profession":"Profession","husbandName":"Husband Name","birthGovernorate":"Birth Governorate","addressStreet":"Street","addressDistrict":"District","addressGovernorate":"Governorate","addressCity":"City","addressPostalCode":"Postal Code","addressCountry":"Country"};

/** Is this rule mandatory for this document type? Mirror of ekycCanonical.ruleApplies. */
export function ekycRuleApplies(rule: EkycFieldRule | undefined, idType: number): boolean {
  if (rule === 'M') { return true; }
  if (rule && typeof rule === 'object' && Array.isArray(rule.C)) { return rule.C.includes(Number(idType)); }
  return false;
}

/** Required identity fields for a level + idType (mirror of ekycCanonical.requiredFieldsForLevel). */
export function ekycRequiredFieldsForLevel(level: number, idType = 1): string[] {
  if (Number(level) < 2) { return []; }
  return Object.keys(EKYC_FIELD_RULES).filter(f => ekycRuleApplies(EKYC_FIELD_RULES[f], idType));
}

/** Required document images for a level + idType (mirror of ekycCanonical.requiredEvidenceForLevel). */
export function ekycRequiredEvidenceForLevel(level: number, idType = 1): string[] {
  if (Number(level) < 2) { return []; }
  return Object.keys(EKYC_EVIDENCE_RULES).filter(f => ekycRuleApplies(EKYC_EVIDENCE_RULES[f], idType));
}
