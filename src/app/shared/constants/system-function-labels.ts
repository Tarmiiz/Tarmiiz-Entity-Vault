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
  'credit-bank-transfer': 'systemFunctionLabels.creditBankTransfer',
  'credit-route-credit':  'systemFunctionLabels.creditRouteCredit',
  'service-add-validator':         'systemFunctionLabels.serviceAddValidator',
  'service-add-payment-processor': 'systemFunctionLabels.serviceAddPaymentProcessor',
  'service-add-custodian':         'systemFunctionLabels.serviceAddCustodian',
  'service-edit-metadata':         'systemFunctionLabels.serviceEditMetadata',
  'service-change-visibility':     'systemFunctionLabels.serviceChangeVisibility',
  'service-change-state':          'systemFunctionLabels.serviceChangeState',
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
