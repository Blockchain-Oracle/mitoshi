/**
 * The bridge CTA's ladder (R4-12, D-227; D-045 "the label is the blocker"): pure, so the card only draws. The label is
 * always the next thing to do, and sign-in comes at the end, for the action — never a wall before value.
 *
 * In:  amount → link the Robinhood wallet → switch it to Robinhood Chain → test ETH/stock (faucet) → sign in to receive →
 *      enough stock → route live → route connected → today's room → quote → enough ETH for the fee → approve → bridge.
 * Out: amount → link the Robinhood wallet (the destination) → enough bT → route live → route connected → today's room →
 *      quote → enough pathUSD for the fee → bridge (signed out: the same label, and the tap opens sign-in for it).
 */
import { fromShared, type BridgeDirection } from "@cwf/core";
import type { BridgeQuote, RobinhoodHoldings, RouteCapacity, RouteLinks, TempoHoldings } from "@cwf/markets/stocks";

export type BridgeStepKind =
  | "amount" | "link" | "switch-chain" | "faucet" | "sign-in" | "not-enough" | "not-enough-fee" | "over-limit"
  | "not-live" | "not-connected" | "paused" | "quoting" | "approve" | "bridge";

export interface BridgeStep {
  kind: BridgeStepKind;
  /** The step is a tap (link, switch, faucet, sign-in, approve, bridge); otherwise the button names a blocker. */
  actionable: boolean;
  /** Bridge-out while signed out: the bridge label, and the tap opens sign-in for it. */
  needsSignIn?: boolean;
}

export interface LadderInput {
  direction: BridgeDirection;
  amountSD: bigint | null;
  /** The linked Robinhood wallet and the chain it is on; null when none is linked. */
  robinhood: { chainId: number } | null;
  robinhoodChainId: number;
  signedIn: boolean;
  rh: RobinhoodHoldings | null;
  tempo: TempoHoldings | null;
  links: RouteLinks | null;
  capacity: RouteCapacity | null;
  quote: BridgeQuote | null;
  /** Sends paused on the Tempo adapter (out). */
  paused: boolean;
}

const step = (kind: BridgeStepKind, actionable = false, needsSignIn = false): BridgeStep => (needsSignIn ? { kind, actionable, needsSignIn } : { kind, actionable });

function route(i: LadderInput, ready: (l: RouteLinks) => boolean): BridgeStep | null {
  if (i.links && !i.links.robinhoodLive) return step("not-live");
  if (i.links && !ready(i.links)) return step("not-connected");
  if (i.capacity && i.amountSD! > i.capacity.availableSD) return step("over-limit");
  return null;
}

export function nextStep(i: LadderInput): BridgeStep {
  if (i.amountSD === null || i.amountSD <= 0n) return step("amount");
  if (!i.robinhood) return step("link", true);
  if (i.direction === "in") {
    if (i.robinhood.chainId !== i.robinhoodChainId) return step("switch-chain", true);
    if (i.rh && (i.rh.eth === 0n || i.rh.stockLD === 0n)) return step("faucet", true);
    if (!i.signedIn) return step("sign-in", true);
    if (i.rh && fromShared(i.amountSD, 18) > i.rh.stockLD) return step("not-enough");
    const blocked = route(i, (l) => l.inReady);
    if (blocked) return blocked;
    if (!i.quote) return step("quoting");
    if (i.rh && i.rh.eth < i.quote.nativeFee) return step("not-enough-fee");
    if (i.rh && i.rh.allowanceLD < i.quote.sendParam.amountLD) return step("approve", true);
    return step("bridge", true);
  }
  if (!i.signedIn) return step("bridge", true, true);
  if (i.tempo && i.amountSD > i.tempo.mirrorSD) return step("not-enough");
  if (i.paused) return step("paused");
  const blocked = route(i, (l) => l.outReady);
  if (blocked) return blocked;
  if (!i.quote) return step("quoting");
  if (i.tempo && i.tempo.pathUsdBase < i.quote.nativeFee) return step("not-enough-fee");
  return step("bridge", true);
}
