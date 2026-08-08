// Shared display maps for the RFQ surface (list + details), kept in ONE place for the
// same reason as deal-labels.ts: a request that reads "Awarded" on the list and
// "Closed" on the detail page makes an operator distrust both.
//
// The ids mirror the on-chain enum and the 'DEX RFQ Status' / 'DEX RFQ Dealer State'
// Global Variables categories.

/** i18n keys, keyed by IDeals.Request.status. */
export const RFQ_STATUS_LABEL: Record<number, string> = {
  1: 'dex.rfqs.status.open',
  2: 'dex.rfqs.status.awarded',
  3: 'dex.rfqs.status.cancelled',
  4: 'dex.rfqs.status.expired',
};

/**
 * Blue = live, green = it produced a trade, grey = closed without one. Cancelled and
 * Expired are deliberately NOT red: an RFQ that drew no acceptable price is an
 * ordinary outcome, not a failure.
 */
export const RFQ_STATUS_CLASS: Record<number, string> = {
  1: 'bg-blue-100 text-blue-800',
  2: 'bg-green-100 text-green-800',
  3: 'bg-gray-200 text-gray-700',
  4: 'bg-gray-200 text-gray-700',
};

/**
 * i18n keys for a dealer's standing on one request.
 *
 * ⚠️ Won / Lost / Passed have NO on-chain counterpart. Fan-out is lazy and a losing
 * quote dies by predicate — every child transition re-reads "is my parent still
 * Open?" — so nothing ever writes "Lost" anywhere. These are the sync plugin's
 * inference over the invite events plus each child deal's own status.
 */
export const RFQ_DEALER_STATE_LABEL: Record<number, string> = {
  1: 'dex.rfqs.dealerState.invited',
  2: 'dex.rfqs.dealerState.quoted',
  3: 'dex.rfqs.dealerState.won',
  4: 'dex.rfqs.dealerState.lost',
  5: 'dex.rfqs.dealerState.passed',
};

export const RFQ_DEALER_STATE_CLASS: Record<number, string> = {
  1: 'bg-gray-200 text-gray-700',
  2: 'bg-blue-100 text-blue-800',
  3: 'bg-green-100 text-green-800',
  4: 'bg-gray-200 text-gray-700',
  5: 'bg-gray-100 text-gray-500',
};

/**
 * `side` names the REQUESTER's direction — every quote takes the opposite one — so the
 * label must say whose side it is, or a dealer reads it as their own and quotes backwards.
 */
export function rfqSideLabel(side: number): string {
  return side === 1 ? 'dex.rfqs.side.requesterBuys' : 'dex.rfqs.side.requesterSells';
}

/** The side a DEALER takes when answering — the inverse of the requester's. */
export function rfqDealerSideLabel(side: number): string {
  return side === 1 ? 'dex.deals.side.sell' : 'dex.deals.side.buy';
}

/** Funding is IMPOSED on every quote: a Firm request requires capital to answer. */
export function rfqFundingLabel(funding: number): string {
  return funding === 1 ? 'dex.deals.funding.firm' : 'dex.deals.funding.indicative';
}

/**
 * Is `candidate` a better quote than `incumbent`, from the REQUESTER's point of view?
 *
 * Direction-dependent and easy to get backwards: a requester who is BUYING wants the
 * lowest offer, one who is SELLING wants the highest bid. Expressed once here so the
 * "best quote" highlight cannot disagree with the board's ordering.
 */
export function isBetterQuote(side: number, candidate: number, incumbent: number): boolean {
  return side === 1 ? candidate < incumbent : candidate > incumbent;
}
