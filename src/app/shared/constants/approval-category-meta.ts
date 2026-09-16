/**
 * Approval-category metadata — the DOMAIN GROUP and the human name for every
 * maker/checker action category the Entity API publishes.
 *
 * 🔴 WHY THIS FILE EXISTS. The Approval Settings page had a six-entry label map
 * against the API's TWENTY-FIVE categories, and `labelFor` fell back to the raw
 * slug. So nineteen of twenty-five rows printed `credit_route_transfer` in the
 * Description column next to `credit_route_transfer` in the Action column — the
 * same string twice, and no description at all. The six that were mapped read
 * "Asset: state change" while their neighbours read a slug, so the column had
 * two registers as well as two languages.
 *
 * ⚠️ KEEP IN STEP WITH `APPROVAL_CATEGORIES` in the Entity API's `db.js`. That
 * array is the source of truth; this file only says how to GROUP and NAME what
 * it publishes. A category added there and not here falls back to its slug —
 * readable, never blank — and lands in the `other` rail rather than vanishing.
 * A category here that the API has dropped simply never renders.
 *
 * The description keys resolve to one sentence each, all in the same shape: what
 * queues when the category is switched on. That uniformity is the point — an
 * admin reads down the column deciding what to gate, and a column that mixes
 * "Asset: state change" with a bare slug cannot be read that way.
 */

/** Group slug → the rail item a category sits under. */
export const APPROVAL_CATEGORY_GROUPS: Record<string, string> = {
  service_state:              'service',
  service_visibility:         'service',
  service_election_switch:    'service',
  service_party_attach:       'service',
  service_party_detach:       'service',

  subscription_state:         'subscription',

  asset_state:                'asset',
  asset_service_state:        'asset',

  distribution_declare:       'distribution',
  distribution_finalize:      'distribution',

  credit_route_transfer:      'credit',

  entity_sp_add:              'entity',
  entity_sp_state:            'entity',

  custody_hold_place:         'custody',
  custody_hold_release:       'custody',

  settlement_create:          'settlement',
  settlement_confirm_sent:    'settlement',
  settlement_confirm_received:'settlement',

  dex_member_add:             'dex',
  dex_member_accept:          'dex',
  dex_member_remove:          'dex',
  dex_venue_asset_accept:     'dex',
  dex_venue_asset_halt:       'dex',
  dex_venue_asset_remove:     'dex',
  dex_deal_venue_decision:    'dex',
};

/**
 * Domain group for a category — the rail item it belongs under.
 *
 * ⚠️ Deliberately a TABLE, not prefix-parsing on the slug. `entity_sp_add` is an
 * entity-curation act, `asset_service_state` is an ASSET row rather than a
 * service one, and `credit_route_transfer` moves a subscriber's money — three
 * cases where the first segment names the wrong home. The same reasoning as
 * `SYSTEM_FUNCTION_GROUP_OVERRIDES`, which needed five overrides for the same
 * reason; here the exceptions outnumber the rule, so the whole map is explicit.
 */
export function approvalCategoryGroupFor(category: string): string {
  return APPROVAL_CATEGORY_GROUPS[category] ?? 'other';
}

/** Group label — an i18n key under `approvals.policy.groups.*`. */
export function approvalCategoryGroupLabelFor(group: string): string {
  return 'approvals.policy.groups.' + group;
}

/** `service_party_attach` → `servicePartyAttach`, the i18n leaf for a slug. */
function camel(category: string): string {
  return category.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * Human NAME for a category — an i18n key under `approvals.policy.categories.*`.
 * ngx-translate renders an unknown key as-is, so an unmapped category shows a
 * readable path rather than a blank cell.
 */
export function approvalCategoryNameFor(category: string): string {
  return 'approvals.policy.categories.' + camel(category);
}

/** One-sentence description — an i18n key under `approvals.policy.descriptions.*`. */
export function approvalCategoryDescriptionFor(category: string): string {
  return 'approvals.policy.descriptions.' + camel(category);
}
