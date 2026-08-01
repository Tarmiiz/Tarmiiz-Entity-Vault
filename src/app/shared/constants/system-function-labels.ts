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
  'export-excel': 'systemFunctionLabels.exportExcel',
  'export-pdf': 'systemFunctionLabels.exportPdf',
  'view-documents': 'systemFunctionLabels.viewDocuments',
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
