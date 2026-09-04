// i18n dictionary key paths (under `apiEndpointSections.*`) for the API-endpoint registry's
// SECTION names — the Settings → API Endpoints page (Phase 26.7). Sibling of `menu-labels.ts`.
//
// `sectionLabelKey()` returns a translation KEY, not display text — callers must pipe it through
// `| translate` (templates) or `translate.instant()` (TS), exactly like `menuLabelFor`.
//
// ⚠️ THE SECTIONS ARE GENERATED, NOT HAND-MAINTAINED. They come from the API spec's own domain
// tags via `gen-api-endpoints.js`, so this map is a DISPLAY layer over a list that can grow
// without anyone editing this file. That is why the fallback below is a real fallback and not a
// safety net nobody expects to fire: adding a tag to the spec adds a section here, silently.
//
// ⚠️ AND WHY THE FALLBACK IS TITLE-CASE OF THE RAW NAME RATHER THAN A PLACEHOLDER: an unknown
// section must render as something a human can act on. "Asset Documents" with no translation is
// useful; "apiEndpointSections.assetDocuments" or "—" tells an admin nothing about which 12
// endpoints they are looking at. The page must stay usable the day a new tag lands, not the day
// someone remembers to translate it.
export const API_ENDPOINT_SECTIONS: Record<string, string> = {
  'Analytics':              'apiEndpointSections.analytics',
  'App Config':             'apiEndpointSections.appConfig',
  'Approvals':              'apiEndpointSections.approvals',
  'Asset Documents':        'apiEndpointSections.assetDocuments',
  'Assets':                 'apiEndpointSections.assets',
  'Audit':                  'apiEndpointSections.audit',
  'Clearing':               'apiEndpointSections.clearing',
  'Connect':                'apiEndpointSections.connect',
  'Credit':                 'apiEndpointSections.credit',
  'Custody':                'apiEndpointSections.custody',
  'DEX':                    'apiEndpointSections.dex',
  'Directory':              'apiEndpointSections.directory',
  'Distribution':           'apiEndpointSections.distribution',
  'Distributions':          'apiEndpointSections.distributions',
  'Documents':              'apiEndpointSections.documents',
  'Encryption Keys':        'apiEndpointSections.encryptionKeys',
  'Fees':                   'apiEndpointSections.fees',
  'Global':                 'apiEndpointSections.global',
  'Integrations':           'apiEndpointSections.integrations',
  'IPFS':                   'apiEndpointSections.ipfs',
  'Logs':                   'apiEndpointSections.logs',
  'Menu Config':            'apiEndpointSections.menuConfig',
  'Onboarding':             'apiEndpointSections.onboarding',
  'Regulator Submissions':  'apiEndpointSections.regulatorSubmissions',
  'Service Documents':      'apiEndpointSections.serviceDocuments',
  'Service Providers':      'apiEndpointSections.serviceProviders',
  'Services':               'apiEndpointSections.services',
  'Sessions':               'apiEndpointSections.sessions',
  'Settings Backup':        'apiEndpointSections.settingsBackup',
  'Settlements':            'apiEndpointSections.settlements',
  'Signer Keys':            'apiEndpointSections.signerKeys',
  'Stats':                  'apiEndpointSections.stats',
  'Subscription Documents': 'apiEndpointSections.subscriptionDocuments',
  'Subscriptions':          'apiEndpointSections.subscriptions',
  'Sync':                   'apiEndpointSections.sync',
  'Transactions':           'apiEndpointSections.transactions',
  'User Groups':            'apiEndpointSections.userGroups',
  'Vault Core':             'apiEndpointSections.vaultCore',
  'Vault Users':            'apiEndpointSections.vaultUsers',
};

/**
 * Translation key for a registry section, or the section name itself when unmapped.
 *
 * ⚠️ Returning the RAW NAME as the fallback is deliberate and depends on ngx-translate echoing
 * an unknown key. The section names are already Title Case in the registry ("Asset Documents"),
 * so an unmapped section renders as itself rather than as a key path — the one case where the
 * echo behaviour is useful instead of a bug.
 */
export function sectionLabelKey(section: string): string {
  return API_ENDPOINT_SECTIONS[section] ?? section;
}
