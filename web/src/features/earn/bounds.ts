import { BPS_PER_X, type LeverageReserveState, type ParlayReserveState } from "@cwf/core";
import type { RangeReserveState } from "@cwf/core/range";
import { bpsPct, money2 } from "./format";

/**
 * Owarine 90a91d71 `features/earn/bounds.ts`: §02 on a house reserve — the deployed program's own numbers, never a
 * projection. R4-7 (D-227): Free and the committed leg moved into the capital bar; each note is 45 characters or fewer
 * and sits behind an (i) (copy spec cuts #58–#63).
 */
export interface BoundRow {
  label: string;
  value: string;
  /** What the number means for a supplier, in one short line; never a projection. */
  note: string;
}

const multiple = (bps: number): string => `${Math.round((bps / BPS_PER_X) * 10) / 10}×`;

export function rangeBounds(state: RangeReserveState): BoundRow[] {
  const { params, decimals } = state;
  return [
    { label: "House margin", value: bpsPct(params.marginBps), note: "Added to fair odds. All suppliers earn." },
    { label: "Most at risk", value: bpsPct(params.maxExposureBps), note: "Share of equity bands may lock." },
    { label: "Top band payout", value: money2(params.maxPayoutCapBase, decimals), note: "The worst one round can cost." },
    { label: "Most at one expiry", value: money2(params.maxExpiryLockedBase, decimals), note: "Cap on what comes due at once." },
  ];
}

export function parlayBounds(state: ParlayReserveState): BoundRow[] {
  const { params, decimals } = state;
  return [
    { label: "House margin", value: bpsPct(params.marginBps), note: "Added to every ticket. All suppliers earn." },
    { label: "Same-instant floor", value: bpsPct(params.correlationBps), note: "Legs settling together are priced together." },
    { label: "Legs at most", value: `${params.maxLegs}`, note: "Longer tickets are refused." },
    { label: "Most at risk", value: bpsPct(params.maxExposureBps), note: "Share of equity tickets may lock." },
    { label: "Top ticket payout", value: money2(params.maxPayoutCapBase, decimals), note: "The worst one ticket can cost." },
    { label: "Most at one expiry", value: money2(params.maxExpiryLockedBase, decimals), note: "Cap on what comes due at once." },
  ];
}

export function boostBounds(state: LeverageReserveState): BoundRow[] {
  const { params, decimals } = state;
  return [
    { label: "Premium", value: bpsPct(params.premiumBps), note: "Taken on the front at open. All suppliers earn." },
    { label: "Most leverage", value: multiple(params.maxLeverageBps), note: "Past this the contract refuses." },
    { label: "Knock-out line", value: bpsPct(params.maintenanceBps), note: "Of the front; under it anyone may close." },
    { label: "Most fronted", value: money2(params.maxFrontedPerPositionBase, decimals), note: "Cap on one boost's front." },
  ];
}
