// Human labels for the per-user "System Functions" registry (action-button gating).
// Mirrors menu-labels.ts. The canonical key list + per-key defaults live server-side in
// the Entity API's db.SYSTEM_FUNCTIONS; this map only provides display labels.
// Add a label here whenever a new system-function key is added to the API registry.
// Labels follow a "Page - Function" convention: the first key segment names the
// page/module the button lives on, the rest names the action.
export const SYSTEM_FUNCTION_LABELS: Record<string, string> = {
  'credit-bank-transfer': 'Credit - Bank Transfer',
  'credit-route-credit':  'Credit - Route Credit',
  'service-add-validator':         'Service - Add Validator',
  'service-add-payment-processor': 'Service - Add Payment Processor',
  'service-add-custodian':         'Service - Add Custodian',
  'service-edit-metadata':         'Service - Edit Metadata',
  'service-change-visibility':     'Service - Change Visibility',
  'service-change-state':          'Service - Change State',
  'subscription-change-state':     'Subscription - Change State',
  'asset-change-state':            'Asset - Change State',
  'venue-change-state':            'Venue - Change State',
  'export-excel': 'Action - Export Excel',
  'export-pdf': 'Action - Export PDF',
  'view-documents': 'Action - View Documents',
};

export function systemFunctionLabelFor(key: string): string {
  if (SYSTEM_FUNCTION_LABELS[key]) return SYSTEM_FUNCTION_LABELS[key];
  // Fallback: "page-rest-of-key" → "Page - Rest Of Key"
  const title = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const parts = key.split('-');
  if (parts.length > 1) return title(parts[0]) + ' - ' + parts.slice(1).map(title).join(' ');
  return title(parts[0]);
}
