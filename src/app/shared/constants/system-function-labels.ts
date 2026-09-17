// i18n dictionary key paths (under `systemFunctionLabels.*`) for the per-user
// "System Functions" registry (action-button gating). Mirrors menu-labels.ts. The
// canonical key list + per-key defaults live server-side in the Entity API's
// db.SYSTEM_FUNCTIONS; this map only provides translation-key lookups.
// Add an entry here whenever a new system-function key is added to the API registry.
// Labels follow a "Page - Function" convention: the first key segment names the
// page/module the button lives on, the rest names the action.
// systemFunctionLabelFor() returns a translation KEY, not display text — callers
// must pipe the result through `| translate` (templates) or pass it to
// translate.instant() (TS).
export const SYSTEM_FUNCTION_LABELS: Record<string, string> = {
  'entity-edit-identifiers': 'systemFunctionLabels.entityEditIdentifiers',
  // The entity may REQUEST an onc/offc switch; the regulator approves it. There is deliberately
  // no 'service-election-declare' entry here — that key is inert on this side, because the
  // SERVICE'S REGULATOR declares the election (P_ELECTION_DECLARE is gated K_REGULATOR_OF).
  'service-election-switch': 'systemFunctionLabels.serviceElectionSwitch',
  // Phase 34.5/34.6. Default-DENY: a peer is what makes this Vault reachable for a
  // person at all, so it is a network credential and is granted deliberately.
  'user-vpn-manage':       'systemFunctionLabels.userVpnManage',
  'credit-bank-transfer': 'systemFunctionLabels.creditBankTransfer',
  'credit-route-credit':  'systemFunctionLabels.creditRouteCredit',
  'service-add-validator':         'systemFunctionLabels.serviceAddValidator',
  'service-add-payment-processor': 'systemFunctionLabels.serviceAddPaymentProcessor',
  'service-add-custodian':         'systemFunctionLabels.serviceAddCustodian',
  'service-add-clearing-house':    'systemFunctionLabels.serviceAddClearingHouse',
  // Phase 4.9's fund-level appointments (classes 7 / 8), attachable from the Vault since 2026-09-17.
  'service-add-depositary':          'systemFunctionLabels.serviceAddDepositary',
  'service-add-fund-administrator':  'systemFunctionLabels.serviceAddFundAdministrator',
  // Clearing (deferred DvP). The CCP's own acts + a member's consent. The three permissionless
  // triggers (finalize / deliver / fail) have NO key on purpose — anyone may drive them on chain.
  'clearing-member-admit':         'systemFunctionLabels.clearingMemberAdmit',
  'clearing-member-accept':        'systemFunctionLabels.clearingMemberAccept',
  'clearing-member-state':         'systemFunctionLabels.clearingMemberState',
  'clearing-currency':             'systemFunctionLabels.clearingCurrency',
  'clearing-cycle-close':          'systemFunctionLabels.clearingCycleClose',
  'clearing-confirm-pay-in':       'systemFunctionLabels.clearingConfirmPayIn',
  'clearing-funding-service':      'systemFunctionLabels.clearingFundingService',
  'service-edit-metadata':         'systemFunctionLabels.serviceEditMetadata',
  'service-change-visibility':     'systemFunctionLabels.serviceChangeVisibility',
  'service-change-state':          'systemFunctionLabels.serviceChangeState',
  'service-straight-through':      'systemFunctionLabels.serviceStraightThrough',
  // Fund import — two keys, because they are two authorities: the first bulk-creates identities
  // from investor PII, the second moves cash and issues units. Both default-DENY on the API.
  'service-import-subscribers':    'systemFunctionLabels.serviceImportSubscribers',
  'service-import-balances':       'systemFunctionLabels.serviceImportBalances',
  'subscription-change-state':     'systemFunctionLabels.subscriptionChangeState',
  'asset-change-state':            'systemFunctionLabels.assetChangeState',
  'venue-change-state':            'systemFunctionLabels.venueChangeState',
  'asset-add-distribution':        'systemFunctionLabels.assetAddDistribution',
  'custody-hold-place':            'systemFunctionLabels.custodyHoldPlace',
  'custody-hold-release':          'systemFunctionLabels.custodyHoldRelease',
  'settlement-create':           'systemFunctionLabels.settlementCreate',
  'settlement-confirm-sent':     'systemFunctionLabels.settlementConfirmSent',
  'settlement-confirm-received': 'systemFunctionLabels.settlementConfirmReceived',
  'dex-offering-create':         'systemFunctionLabels.dexOfferingCreate',
  'dex-offering-cancel':         'systemFunctionLabels.dexOfferingCancel',
  'dex-member-add':              'systemFunctionLabels.dexMemberAdd',
  'dex-member-accept':           'systemFunctionLabels.dexMemberAccept',
  'dex-member-remove':           'systemFunctionLabels.dexMemberRemove',
  'export-excel': 'systemFunctionLabels.exportExcel',
  'export-pdf': 'systemFunctionLabels.exportPdf',
  'view-documents': 'systemFunctionLabels.viewDocuments',
  'view-identity-data': 'systemFunctionLabels.viewIdentityData',
  // ─── Comprehensive sweep (2026-08-06) ───────────────────────────────────────
  'asset-create':                'systemFunctionLabels.assetCreate',
  'asset-register-existing':     'systemFunctionLabels.assetRegisterExisting',
  'asset-edit-metadata':         'systemFunctionLabels.assetEditMetadata',
  'asset-edit-identifiers':      'systemFunctionLabels.assetEditIdentifiers',
  // A8 registration lifecycle (Phase 15) — four separately delegable acts: filing the
  // declaration is compliance, composing a Custom asset's rows is product, appointing a
  // provider is procurement, and ACCEPTING a role is this tenant answering as a PROVIDER on
  // someone else's asset — the only one where we are not the issuer.
  'asset-declaration':           'systemFunctionLabels.assetDeclaration',
  'asset-compose':               'systemFunctionLabels.assetCompose',
  'asset-party-attach':          'systemFunctionLabels.assetPartyAttach',
  'asset-party-accept':          'systemFunctionLabels.assetPartyAccept',
  'asset-mint':                  'systemFunctionLabels.assetMint',
  'asset-burn':                  'systemFunctionLabels.assetBurn',
  'asset-set-price':             'systemFunctionLabels.assetSetPrice',
  'asset-add-service':           'systemFunctionLabels.assetAddService',
  'asset-service-can-quote':     'systemFunctionLabels.assetServiceCanQuote',
  'asset-service-change-state':  'systemFunctionLabels.assetServiceChangeState',
  'asset-execute-distribution':  'systemFunctionLabels.assetExecuteDistribution',
  'asset-finalize-distribution': 'systemFunctionLabels.assetFinalizeDistribution',
  'credit-deposit':              'systemFunctionLabels.creditDeposit',
  'credit-withdraw':             'systemFunctionLabels.creditWithdraw',
  'service-create':              'systemFunctionLabels.serviceCreate',
  'service-liquidity-inject':    'systemFunctionLabels.serviceLiquidityInject',
  'service-liquidity-withdraw':  'systemFunctionLabels.serviceLiquidityWithdraw',
  'service-fee-config':          'systemFunctionLabels.serviceFeeConfig',
  'entity-edit-metadata':        'systemFunctionLabels.entityEditMetadata',
  'entity-external-contracts':   'systemFunctionLabels.entityExternalContracts',
  'subscriber-onboard':          'systemFunctionLabels.subscriberOnboard',
  'transaction-create':          'systemFunctionLabels.transactionCreate',
  'settlement-cancel':           'systemFunctionLabels.settlementCancel',
  'dex-venue-create':            'systemFunctionLabels.dexVenueCreate',
  'dex-venue-tier-request':      'systemFunctionLabels.dexVenueTierRequest',
  'dex-listing-create':          'systemFunctionLabels.dexListingCreate',
  'dex-listing-venue-manage':    'systemFunctionLabels.dexListingVenueManage',
  // The venue operator's leg on a pairing — the mirror of dex-listing-venue-manage
  // above, which is the ISSUER's side of the same relation.
  'dex-venue-asset-accept':      'systemFunctionLabels.dexVenueAssetAccept',
  'dex-venue-asset-halt':        'systemFunctionLabels.dexVenueAssetHalt',
  'dex-venue-asset-remove':      'systemFunctionLabels.dexVenueAssetRemove',
  'dex-order-place':             'systemFunctionLabels.dexOrderPlace',
  'dex-order-cancel':            'systemFunctionLabels.dexOrderCancel',
  'dex-match':                   'systemFunctionLabels.dexMatch',
  // Negotiated OTC deals — five trader verbs kept separate because they are five
  // different powers (proposing commits nothing; accepting locks both sides), plus
  // one pair key for the venue operator's approve/reject decision.
  'dex-deal-propose':            'systemFunctionLabels.dexDealPropose',
  'dex-deal-counter':            'systemFunctionLabels.dexDealCounter',
  'dex-deal-accept':             'systemFunctionLabels.dexDealAccept',
  'dex-deal-decline':            'systemFunctionLabels.dexDealDecline',
  'dex-deal-withdraw':           'systemFunctionLabels.dexDealWithdraw',
  'dex-deal-venue-decision':     'systemFunctionLabels.dexDealVenueDecision',
  // RFQ. `dex-rfq-award` is separate from `dex-deal-accept` even though awarding IS an
  // accept on the winning child: answering someone else's RFQ takes on one position the
  // desk chose, while awarding picks a winner out of a competitive field the desk itself
  // convened — and that selection is what a supervisor wants attributable to a person.
  'dex-rfq-create':              'systemFunctionLabels.dexRfqCreate',
  'dex-rfq-quote':               'systemFunctionLabels.dexRfqQuote',
  'dex-rfq-award':               'systemFunctionLabels.dexRfqAward',
  'dex-rfq-cancel':              'systemFunctionLabels.dexRfqCancel',
  'distribution-accept':         'systemFunctionLabels.distributionAccept',
  'manage-documents':            'systemFunctionLabels.manageDocuments',
};

// Translation key for a system-function key (pipe through `| translate` /
// translate.instant() at the call site). Falls back to a derived "Page - Rest Of
// Key" display string for keys without an explicit entry — this fallback is a plain
// display string (not a dictionary key), which ngx-translate renders as-is when no
// matching translation exists.
export function systemFunctionLabelFor(key: string): string {
  if (SYSTEM_FUNCTION_LABELS[key]) return SYSTEM_FUNCTION_LABELS[key];
  // Fallback: "page-rest-of-key" → "Page - Rest Of Key"
  const title = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const parts = key.split('-');
  if (parts.length > 1) return title(parts[0]) + ' - ' + parts.slice(1).map(title).join(' ');
  return title(parts[0]);
}

// ─── Grouping, for the System Functions sub-tab rail ─────────────────────────
//
// 89 keys in one flat table is a scroll, not a control surface, so the User
// Details tab rails them by domain (Standard 2.1's grouped-list case).
//
// ⚠️ THE GROUP IS DERIVED FROM THE KEY, NOT FROM THE LABEL, and that is the
// whole point. Parsing the label's "X - Y" prefix looked easier and is wrong
// twice over: (1) it is LANGUAGE-DEPENDENT, so the rail would regroup — and in
// places collapse — under Arabic; (2) the English prefixes are not consistent.
// Measured 2026-09-16 across the 89 labels: `Asset` (16) sits beside `Assets`
// (2), `Service` (11) beside `Services` (1), `Subscription` beside
// `Subscriptions`, and TEN labels carry no prefix at all. Prefix-parsing would
// therefore have rendered "Asset" and "Assets" as two adjacent rail items and
// dropped ten functions into a nameless bucket. The keys have none of that:
// they are always `<domain>-<action>`.
//
// Overrides below are only for keys whose first segment is NOT its domain.
const SYSTEM_FUNCTION_GROUP_OVERRIDES: Record<string, string> = {
  // A venue is a DEX concept; `venue-change-state` would otherwise be a rail
  // item of one, next to the 25-row DEX group it belongs in.
  'venue-change-state': 'dex',
  // A subscriber IS the subscription surface.
  'subscriber-onboard': 'subscription',
  // Cross-cutting capabilities that belong to no single domain: the two export
  // buttons, the two identity/document read gates and the document write gate.
  // Their own first segments (`export`, `view`, `manage`) name a VERB, not a
  // place, which is exactly why they need naming here.
  'export-excel':       'general',
  'export-pdf':         'general',
  'view-documents':     'general',
  'view-identity-data': 'general',
  'manage-documents':   'general',
};

/**
 * Domain group for a system-function key — the rail item it belongs under.
 * Returns a stable lowercase slug; render it through
 * `systemFunctionGroupLabelFor()`.
 */
export function systemFunctionGroupFor(key: string): string {
  return SYSTEM_FUNCTION_GROUP_OVERRIDES[key] ?? key.split('-')[0];
}

/**
 * Display label for a group slug. Returns an i18n KEY under
 * `systemFunctionGroups.*`; ngx-translate renders an unknown key as-is, so a
 * brand-new domain shows a readable Title-Cased slug until someone translates
 * it — never a blank rail item.
 */
export function systemFunctionGroupLabelFor(group: string): string {
  return 'systemFunctionGroups.' + group;
}

/**
 * Strip the group name off a function label when the label is rendered INSIDE
 * that group's rail — "Service - Add Clearing House" under a rail item reading
 * "Services" is the word twice, and it is the widest column on the table.
 *
 * ⚠️ Takes RESOLVED strings, not i18n keys. The two apps' `systemFunctionLabelFor`
 * deliberately differ in what they return — the Vault an i18n key, the Regulator
 * display text (that app's call site does not pipe through `translate`) — so the
 * only layer both can share is after resolution. Keep this function pure for the
 * same reason: it must not reach for a TranslateService.
 *
 * Deliberately NOT applied in `fnLabelFor` itself. That helper also feeds the
 * search filter, the row sort and the confirm dialogs, where the label appears
 * with no rail beside it to supply the context — there, "Add Clearing House"
 * alone is ambiguous across three domains. Group context earns the strip; its
 * absence is what makes the prefix worth keeping.
 *
 * Both separators are real and both ship today: " - " on most rows and ": " on
 * the two import functions. Matching is case-insensitive and tolerates the
 * SINGULAR prefix under a PLURAL rail item ("Service" under "Services"), which
 * is the common case — the rail labels are plural nouns and the prefixes are not.
 * Anything that does not match is returned untouched, so a label with no prefix
 * (there are ten) and a group whose name shares no stem with its members
 * ("General") both pass through unchanged rather than being truncated.
 */
export function systemFunctionLabelInGroup(label: string, groupLabel: string): string {
  if (!label || !groupLabel) return label;
  const cut = /^(.+?)(\s-\s|:\s)/.exec(label);
  if (!cut) return label;
  const head = cut[1].trim().toLowerCase();
  const group = groupLabel.trim().toLowerCase();
  const matches = head === group || head + 's' === group || head === group + 's';
  return matches ? label.slice(cut[0].length).trim() : label;
}
