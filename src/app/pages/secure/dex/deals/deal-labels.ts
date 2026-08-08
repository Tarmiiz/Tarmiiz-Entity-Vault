// Shared display maps for the negotiated-OTC deal surface (list + details).
//
// Kept in ONE place because the two pages must agree: a status pill that reads
// "Rejected" on the list and "Declined" on the detail page is the kind of drift that
// makes an operator distrust both. The ids mirror the on-chain enums and the
// 'DEX Deal Status' / 'DEX Deal Round Action' Global Variables categories.

/** i18n keys, keyed by IDeals.Deal.status. */
export const DEAL_STATUS_LABEL: Record<number, string> = {
  1: 'dex.deals.status.proposed',
  2: 'dex.deals.status.accepted',
  3: 'dex.deals.status.settled',
  4: 'dex.deals.status.rejected',
  5: 'dex.deals.status.withdrawn',
  6: 'dex.deals.status.venueRejected',
  7: 'dex.deals.status.expired',
};

/**
 * Pill classes. Blue = live and ours to move, amber = live and waiting on someone
 * else, green = done, grey/red = closed. Deliberately NOT a red/green pass-fail:
 * a withdrawn or expired deal is an ordinary outcome, not a failure.
 */
export const DEAL_STATUS_CLASS: Record<number, string> = {
  1: 'bg-blue-100 text-blue-800',
  2: 'bg-amber-100 text-amber-800',
  3: 'bg-green-100 text-green-800',
  4: 'bg-gray-200 text-gray-700',
  5: 'bg-gray-200 text-gray-700',
  6: 'bg-red-100 text-red-800',
  7: 'bg-gray-200 text-gray-700',
};

/** i18n keys for the negotiation ledger's verbs, keyed by dex_deal_rounds.action. */
export const DEAL_ACTION_LABEL: Record<number, string> = {
  1:  'dex.deals.action.propose',
  2:  'dex.deals.action.counter',
  3:  'dex.deals.action.accept',
  4:  'dex.deals.action.reject',
  5:  'dex.deals.action.withdraw',
  6:  'dex.deals.action.venueApprove',
  7:  'dex.deals.action.venueReject',
  8:  'dex.deals.action.expire',
  9:  'dex.deals.action.suspend',
  10: 'dex.deals.action.unsuspend',
  11: 'dex.deals.action.funded',
  12: 'dex.deals.action.released',
  13: 'dex.deals.action.settled',
};

export const DEAL_ACTION_CLASS: Record<number, string> = {
  1:  'bg-blue-100 text-blue-800',
  2:  'bg-indigo-100 text-indigo-800',
  3:  'bg-amber-100 text-amber-800',
  4:  'bg-gray-200 text-gray-700',
  5:  'bg-gray-200 text-gray-700',
  6:  'bg-green-100 text-green-800',
  7:  'bg-red-100 text-red-800',
  8:  'bg-gray-200 text-gray-700',
  9:  'bg-red-100 text-red-800',
  10: 'bg-green-100 text-green-800',
  11: 'bg-purple-100 text-purple-800',
  12: 'bg-purple-100 text-purple-800',
  13: 'bg-green-100 text-green-800',
};

/**
 * `side` names the PROPOSER's direction and never changes through counters — so the
 * label must say whose side it is, or a reader assumes it describes the deal.
 */
export function dealSideLabel(side: number): string {
  return side === 1 ? 'dex.deals.side.proposerBuys' : 'dex.deals.side.proposerSells';
}

/**
 * Firm vs Indicative is about WHEN the proposer's money locks, not whether settlement
 * uses escrow — both sides always lock at acceptance.
 */
export function dealFundingLabel(funding: number): string {
  return funding === 1 ? 'dex.deals.funding.firm' : 'dex.deals.funding.indicative';
}
