import { BPS_PER_X, type LeverageReserveState, type ParlayReserveState, type ReserveSheet } from "@cwf/core";
import type { RangeReserveState } from "@cwf/core/range";
import { bpsPct, money2 } from "./format";
import type { ReserveWords } from "./reserves";

/** Owarine 90a91d71 `features/earn/bounds.ts`: §02 on a house reserve — the deployed program's own numbers, never a projection. */
export interface BoundRow {
  label: string;
  value: string;
  /** What the number means for a supplier; never a projection. */
  note: string;
}

const multiple = (bps: number): string => `${Math.round((bps / BPS_PER_X) * 10) / 10}×`;

/** The two rows every reserve has: what it can pay out today, and what it is already holding. */
function sheetRows(sheet: ReserveSheet, words: ReserveWords): BoundRow[] {
  return [
    { label: "Free to withdraw", value: money2(sheet.liquidBase, sheet.decimals), note: "Equity no live position is holding. A withdrawal larger than this is refused by the contract, not by the page." },
    { label: words.committed, value: money2(sheet.committedBase, sheet.decimals), note: words.committedRow },
  ];
}

export function rangeBounds(state: RangeReserveState, sheet: ReserveSheet, words: ReserveWords): BoundRow[] {
  const { params, decimals } = state;
  return [
    ...sheetRows(sheet, words),
    { label: "House margin", value: bpsPct(params.marginBps), note: "Added to the fair probability on every band the reserve prices. It is the whole of what suppliers earn here." },
    { label: "Most of equity at risk", value: bpsPct(params.maxExposureBps), note: "The reserve refuses a band that would lock more than this share of provider equity." },
    { label: "Biggest payout on one band", value: money2(params.maxPayoutCapBase, decimals), note: "A cap on the single worst loss one round can hand the reserve." },
    { label: "Most locked at one expiry", value: money2(params.maxExpiryLockedBase, decimals), note: "Two Series expiring together are one risk, so the reserve caps what may come due at any one boundary." },
  ];
}

export function parlayBounds(state: ParlayReserveState, sheet: ReserveSheet, words: ReserveWords): BoundRow[] {
  const { params, decimals } = state;
  return [
    ...sheetRows(sheet, words),
    { label: "House margin", value: bpsPct(params.marginBps), note: "Added to the combined probability of every ticket. It is the whole of what suppliers earn here." },
    { label: "Same-instant floor", value: bpsPct(params.correlationBps), note: "Legs that settle at the same instant are not independent, so their combined price is floored rather than multiplied out." },
    { label: "Legs at most", value: `${params.maxLegs}`, note: "More legs is a longer price and a larger payout; the reserve refuses tickets past this." },
    { label: "Most of equity at risk", value: bpsPct(params.maxExposureBps), note: "The reserve refuses a ticket that would lock more than this share of provider equity." },
    { label: "Biggest payout on one ticket", value: money2(params.maxPayoutCapBase, decimals), note: "A cap on the single worst loss one ticket can hand the reserve." },
    { label: "Most locked at one expiry", value: money2(params.maxExpiryLockedBase, decimals), note: "What may come due at any one boundary, however many tickets land on it." },
  ];
}

export function boostBounds(state: LeverageReserveState, sheet: ReserveSheet, words: ReserveWords): BoundRow[] {
  const { params, decimals } = state;
  return [
    ...sheetRows(sheet, words),
    { label: "Premium taken up front", value: bpsPct(params.premiumBps), note: "Charged on the capital the reserve fronts, at the moment a boost opens. It is the whole of what suppliers earn here." },
    { label: "Most leverage", value: multiple(params.maxLeverageBps), note: "The largest multiple a boost may ask for; past it the contract refuses." },
    { label: "Knock-out line", value: `${bpsPct(params.maintenanceBps)} of the front`, note: "Anyone may close a boost once its mark falls under this much of the capital the reserve fronted, which is what keeps the front whole." },
    { label: "Most fronted on one boost", value: money2(params.maxFrontedPerPositionBase, decimals), note: "A cap on how much one position can put at risk." },
    { label: "Boosts open at once", value: `${state.openPositions} of ${params.maxOpenPositions}`, note: "The reserve tracks its live positions in fixed slots, so there is a hard ceiling on how many it can carry." },
  ];
}
