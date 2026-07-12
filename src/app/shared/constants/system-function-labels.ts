// Human labels for the per-user "System Functions" registry (action-button gating).
// Mirrors menu-labels.ts. The canonical key list + per-key defaults live server-side in
// the Entity API's db.SYSTEM_FUNCTIONS; this map only provides display labels.
// Add a label here whenever a new system-function key is added to the API registry.
export const SYSTEM_FUNCTION_LABELS: Record<string, string> = {
  'credit-bank-transfer': 'Bank Transfer',
  'credit-route-credit':  'Route Credit',
};

export function systemFunctionLabelFor(key: string): string {
  if (SYSTEM_FUNCTION_LABELS[key]) return SYSTEM_FUNCTION_LABELS[key];
  // Fallback: kebab-case → Title Case
  return key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
