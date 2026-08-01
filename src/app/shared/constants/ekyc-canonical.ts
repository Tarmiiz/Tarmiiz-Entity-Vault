// ekyc-canonical.ts — GENERATED mirror of the platform canonical identity schema.
// Source: Tarmiiz eKYC/Services/eKYC API/src/canonical/ekyc-canonical.schema.json (v3).
// DO NOT EDIT BY HAND — regenerate with `node scripts/gen-canonical-ts.js` in the eKYC Service repo.
// Drift vs the schema is reported by d:\Code\Products\scripts\check-canonical-sync.ps1.

export const EKYC_CANONICAL_SCHEMA_VERSION = 3;

/** Numeric values of the Global Variables 'ID Type - Individual' category. */
export const EKYC_ID_TYPES: Record<number, string> = {"1":"National ID","2":"Passport","3":"Driver License"};

/** Every caller-suppliable identity field, in canonical storage order. */
export const EKYC_IDENTITY_FIELDS = ["nameFirst","nameLast","nameFull","gender","dateOfBirth","maritalStatus","religion","profession","husbandName","nationalId","nationalIdSerial","idReleaseDate","idExpiryDate","addressStreet","addressDistrict","addressGovernorate","birthGovernorate","idType","idNumber","issuingCountry","issuingAuthority","nationality","placeOfBirth","addressCity","addressPostalCode","addressCountry"] as const;

/** BASE fields required at verification level >= 2, all document types.
 *  The name requirement is the PAIR RULE (nameFull OR nameFirst+nameLast) — checked separately. */
export const EKYC_REQUIRED_BASE = ["idNumber","dateOfBirth","idExpiryDate"] as const;

/** Additional required fields per idType (level >= 2). */
export const EKYC_PER_ID_TYPE_REQUIRED: Record<number, readonly string[]> = {"2":["nationality"]};

/** Display labels per canonical field. */
export const EKYC_FIELD_LABELS: Record<string, string> = {"idType":"ID Type","idNumber":"Document Number","nationalId":"National ID","nationalIdSerial":"ID Serial Number","idReleaseDate":"ID Release Date","idExpiryDate":"ID Expiry Date","issuingCountry":"Issuing Country","issuingAuthority":"Issuing Authority","nameFirst":"First Name","nameLast":"Last Name(s)","nameFull":"Full Name","gender":"Gender","dateOfBirth":"Date of Birth","nationality":"Nationality","placeOfBirth":"Place of Birth","maritalStatus":"Marital Status","religion":"Religion","profession":"Profession","husbandName":"Husband Name","birthGovernorate":"Birth Governorate","addressStreet":"Street","addressDistrict":"District","addressGovernorate":"Governorate","addressCity":"City","addressPostalCode":"Postal Code","addressCountry":"Country"};

/** Required identity fields for a level + idType (mirror of ekycCanonical.requiredFieldsForLevel). */
export function ekycRequiredFieldsForLevel(level: number, idType = 1): string[] {
  if (Number(level) < 2) { return []; }
  return [...EKYC_REQUIRED_BASE, ...(EKYC_PER_ID_TYPE_REQUIRED[Number(idType)] ?? [])];
}
