/*
    Identifier helpers — the browser half of the Entity API's `src/services/identifiers.js`,
    covering both populations: ENTITY identifiers (LEI, commercial registry, …) recorded
    against the entity's own DID, and ASSET identifiers (ISIN, …) stored in an asset's
    public metadata.

    KEEP THE TWO IN STEP. The client copy exists so a bad value is rejected before a
    transaction is signed; the server copy is the boundary. If they drift, the page either
    blocks a value the API would accept or lets through one it rejects — both read to the
    user as the feature being broken.
*/

// Display names of the types carrying an international format. Matched by NAME because the
// numeric id is insertion order in the `ID Type - Entity` / `ID Type - Asset` Global
// Variables categories, and pinning a literal here would silently mis-validate on a
// differently-seeded chain.
export const LEI_TYPE_NAME = 'LEI';
export const ISIN_TYPE_NAME = 'ISIN';

const LEI_RE = /^[A-Z0-9]{18}[0-9]{2}$/;

/*
    ISO 17442 Legal Entity Identifier: 20 upper-case alphanumeric characters ending in two
    check digits, verified with ISO 7064 MOD 97-10 — expand each letter to its two-digit
    ordinal (A=10 … Z=35), read the whole thing as one integer, require `mod 97 == 1`.

    Computed digit-by-digit rather than with BigInt: a 20-character LEI expands to as many
    as 40 digits, and the running remainder keeps every intermediate inside a safe integer.
*/
export function isValidLei(value: string): boolean {
  const v = String(value ?? '').trim().toUpperCase();
  if (v.length !== 20 || !LEI_RE.test(v)) return false;
  return mod97(v) === 1;
}

function mod97(value: string): number {
  let remainder = 0;
  for (const ch of value) {
    const expanded = ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);
    for (const digit of expanded) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder;
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/*
    ISO 6166 International Securities Identification Number: 12 characters — a 2-letter ISO
    3166-1 alpha-2 prefix, a 9-character national security identifier, then one Luhn check
    digit.

    NOT a parameterisation of `mod97` above: the LEI uses ISO 7064 MOD 97-10 and this uses
    Luhn mod 10. They share only the letter-expansion step.

    The subtle part is the ORDER: expand first, alternate second. Letters expand to two
    digits (A=10 … Z=35), so the expanded string is longer than 12 and its length varies
    with how many letters the identifier contains. Doubling every second character of the
    original ISIN — rather than every second digit of the expansion — rejects valid ISINs.
*/
export function isValidIsin(value: string): boolean {
  const v = String(value ?? '').trim().toUpperCase();
  if (v.length !== 12 || !ISIN_RE.test(v)) return false;

  // Expand to digits, check digit included — it takes part in the sum, so verifying is
  // "does the whole thing come to a multiple of 10".
  let digits = '';
  for (const ch of v) {
    digits += ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);
  }

  let sum = 0;
  for (let i = digits.length - 1, fromRight = 0; i >= 0; i--, fromRight++) {
    let d = Number(digits[i]);
    if (fromRight % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/*
    Validate a value for a given ID type NAME. Returns an i18n KEY on failure (callers pipe
    it through `translate`), or '' when the value is acceptable.

    Types without an international standard (commercial registry, tax id, …) are accepted
    non-empty: they are jurisdiction-specific, and inventing a shape for them here would
    reject perfectly valid registration numbers.

    The keys live in the neutral `identifiers.*` i18n namespace rather than under a page,
    because both the entity-profile and the asset-detail modal consume them.
*/
export function validateIdentifierValue(typeName: string, value: string): string {
  const v = String(value ?? '').trim();
  if (!v) return 'identifiers.errors.required';
  if (typeName === LEI_TYPE_NAME && !isValidLei(v)) return 'identifiers.errors.invalidLei';
  if (typeName === ISIN_TYPE_NAME && !isValidIsin(v)) return 'identifiers.errors.invalidIsin';
  return '';
}

// The value as it will be stored. Upper-casing the LEI is load-bearing, not cosmetic: its
// hash is case-sensitive, so accepting mixed case would let one LEI produce several
// distinct "unique" hashes. The ISIN is upper-cased for a different reason — nothing hashes
// it, but an ISIN is canonically upper case and mixed case would make one identifier
// compare unequal to itself across assets. Mirrors the server's normalisation exactly.
export function normalizeIdentifierValue(typeName: string, value: string): string {
  const v = String(value ?? '').trim();
  return (typeName === LEI_TYPE_NAME || typeName === ISIN_TYPE_NAME) ? v.toUpperCase() : v;
}
