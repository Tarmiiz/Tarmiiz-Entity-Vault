// Human labels for the toggleable menu keys — keep in sync with the server-owned
// registry db.MENU_ITEMS (Entity API). Shared by the tenant-wide Menu Settings page
// and the per-user Menu Access tab on User Details.
export const MENU_LABELS: Record<string, string> = {
  assets:         'Assets',
  services:       'Services',
  'service-providers': 'Service Providers',
  custody:        'Custody',
  subscriptions:  'Subscriptions',
  transactions:   'Transactions',
  credit:         'Credit',
  analytics:      'Analytics',
  dex:            'DEX',
  documents:      'Documents',
  'signer-keys':  'Signer Keys',
  messages:       'Messages',
  variables:      'System Variables',
  approvals:      'Approvals',
  logs:           'Audit Trail',
  'credit-operator-actions': 'Credit Operator Actions',
  'asset-t3643':  'Asset T3643 Standard',
};

// Label for a toggleable menu key. Falls back to dropping hyphens and Title-Casing
// each word for keys without an explicit label.
export function menuLabelFor(key: string): string {
  if (MENU_LABELS[key]) return MENU_LABELS[key];
  return key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
