/*
    Service licenses (Phase 28) — the ENTITY side.

    ── 🔴 READ `active`, NEVER `state === 2` ────────────────────────────────────────────────────
    `GET /services/:address/licenses` serves an `active` flag taken from `hasLicense` — the SAME
    predicate every on-chain gate uses — precisely so a display can never disagree with the chain.
    The route's own comment records that `licensesOf` returns every class the subject has ever
    touched (Requested, Denied, Suspended, Revoked included), and that this has already nearly
    published a revoked licence as held, twice, in two different apps.

    So: **`active` decides what the service may DO. `state` is only for saying what happened.**
    `ILicenses.sol` forbids the `=== 2` spelling for the reason that whoever writes it will still
    be writing it after a sixth state exists.

    ── ⚠️ WHAT IS NOT HERE ──────────────────────────────────────────────────────────────────────
    The class NAMES. There are 29 and they live in the on-chain `License Class` catalog, fetched at
    runtime. The service detail page carried a private 3-entry map (27/28/29) against that catalog,
    so every license outside the market family rendered as `Class 14` — the same defect the
    Regulator Dashboard carried, in the same shape, in the second app.

    ⚠️ DUPLICATED from the Regulator Dashboard's copy rather than shared: two independently
    deployed apps with no shared package, matching `identifiers.utils.ts` and the contact-hash
    recipe. The two must stay in step.
*/

export const LICENSE_STATE = Object.freeze({
  REQUESTED: 1,
  ACTIVE:    2,
  SUSPENDED: 3,
  REVOKED:   4,
  DENIED:    5,
});

const LABELS: Record<number, string> = {
  1: 'Requested', 2: 'Active', 3: 'Suspended', 4: 'Revoked', 5: 'Denied',
};

export function licenseStateName(state: number): string {
  return LABELS[Number(state)] ?? String(state);
}

/** Only ACTIVE is green — it is the one state under which the service may actually act. */
export function licenseStateClass(state: number): string {
  switch (Number(state)) {
    case LICENSE_STATE.ACTIVE:    return 'bg-green-100 text-green-800';
    case LICENSE_STATE.REQUESTED: return 'bg-yellow-100 text-yellow-800';
    case LICENSE_STATE.SUSPENDED: return 'bg-amber-100 text-amber-900';
    case LICENSE_STATE.REVOKED:   return 'bg-red-100 text-red-800';
    case LICENSE_STATE.DENIED:    return 'bg-gray-200 text-gray-700';
    default:                      return 'bg-gray-100 text-gray-500';
  }
}

/*
    What the entity should understand about each state — an entity DECIDES nothing here, so the
    only useful thing this surface can do is say plainly what the state means for it.

    ⚠️ SUSPENDED is the one that matters. A grant is good news that can wait for a page refresh; a
    suspension is a capability disappearing underneath a running tenant, and without this the
    entity discovers it by hitting a revert.
*/
export function licenseMeaning(state: number, active: boolean): string {
  if (active) return 'In force — this service may act under it.';
  switch (Number(state)) {
    case LICENSE_STATE.REQUESTED: return 'Applied for. It confers nothing until your regulator approves it.';
    case LICENSE_STATE.SUSPENDED: return 'Suspended by your regulator. It confers NOTHING while suspended — anything relying on it will now fail.';
    case LICENSE_STATE.REVOKED:   return 'Revoked. It confers nothing, and it is not coming back without a new decision.';
    case LICENSE_STATE.DENIED:    return 'Refused. Your regulator declined this application.';
    default:                      return 'Not in force.';
  }
}

export interface ServiceLicense {
  classId: number;
  level: number;
  state: number;
  /** 🔴 From `hasLicense` — the chain's own predicate. THIS decides capability, not `state`. */
  active: boolean;
  regulator: string;
  countryCode: string;
  requestedAt: number;   // MILLISECONDS on the wire
  decidedAt: number;
  directGrant: boolean;  // requestedAt === 0 ⇒ the regulator granted it unprompted
}
