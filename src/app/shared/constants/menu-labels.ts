// i18n dictionary key paths (under `menuLabels.*`) for the toggleable menu keys —
// keep in sync with the server-owned registry db.MENU_ITEMS (Entity API). Shared by
// the tenant-wide Menu Settings page and the per-user Menu Access tab on User Details.
// menuLabelFor() returns a translation KEY, not display text — callers must pipe the
// result through `| translate` (templates) or pass it to translate.instant() (TS).
export const MENU_LABELS: Record<string, string> = {
  assets:         'menuLabels.assets',
  'asset-creator': 'menuLabels.assetCreator',
  services:       'menuLabels.services',
  'service-providers': 'menuLabels.serviceProviders',
  custody:        'menuLabels.custody',
  administered:   'menuLabels.administered',
  subscriptions:  'menuLabels.subscriptions',
  transactions:   'menuLabels.transactions',
  credit:         'menuLabels.credit',
  settlements:    'menuLabels.settlements',
  clearing:       'menuLabels.clearing',
  distribution:   'menuLabels.distribution',
  analytics:      'menuLabels.analytics',
  dex:            'menuLabels.dex',
  documents:      'menuLabels.documents',
  'signer-keys':  'menuLabels.signerKeys',
  messages:       'menuLabels.messages',
  variables:      'menuLabels.variables',
  approvals:      'menuLabels.approvals',
  logs:           'menuLabels.logs',
};

// Translation key for a toggleable menu key (pipe through `| translate` /
// translate.instant() at the call site). Falls back to dropping hyphens and
// Title-Casing each word for keys without an explicit label — this fallback is a
// plain display string (not a dictionary key), which ngx-translate renders as-is
// when no matching translation exists.
export function menuLabelFor(key: string): string {
  if (MENU_LABELS[key]) return MENU_LABELS[key];
  return key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
