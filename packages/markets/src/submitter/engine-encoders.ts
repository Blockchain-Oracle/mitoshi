/**
 * The engine's non-order intents (plan C.2.3): redeem, partial redeem, withdraw credit, claim-all and cancel. Every
 * one pays `msg.sender` only (AD-5), so the relay's engine policy sponsors them all — an exit never needs funds.
 * `redeem-partial` needs the Series' lot size, read once from the lens (Series facts never change).
 */
import { toMarketId, type Hex, type TxIntent } from "@cwf/core";
import { diagnosis } from "@cwf/core";
import { venueOf } from "../ops/venue";
import { cancelOrdersCall, MAX_CANCEL_IDS, redeemCall, redeemPartialCall } from "../engine/calls";
import { planClaimAll } from "../engine/claims";
import { readPositions, readWindows } from "../engine/lens";
import type { EncodeContext, EncodeResult } from "./encoders";

const ENGINE_KINDS = new Set(["redeem", "redeem-partial", "withdraw-credit", "claim-all", "cancel-orders"]);

export async function encodeEngineIntent(intent: TxIntent, ctx: EncodeContext): Promise<EncodeResult | null> {
  if (!ENGINE_KINDS.has(intent.kind)) return null;
  const venue = venueOf(ctx.chainId);
  if (!venue) return { ok: false, diagnosis: diagnosis("not-deployed", `the engine is not deployed on chain ${ctx.chainId}`) };
  const engine = venue.engine;
  switch (intent.kind) {
    case "redeem":
      return { ok: true, value: { area: "engine", calls: [redeemCall(engine, intent.marketId)], sponsored: true, summary: `redeem ${intent.marketId}` } };
    case "redeem-partial": {
      const w = (await readWindows([intent.marketId])).get(intent.marketId);
      if (!w) return { ok: false, diagnosis: diagnosis("not-settled", `unknown Window ${intent.marketId}`) };
      if (intent.amountRaw <= 0n || intent.amountRaw % w.series.lotBase !== 0n) return { ok: false, diagnosis: diagnosis("below-min-quantity", `${intent.amountRaw} is not a whole number of lots (${w.series.lotBase})`) };
      const call = redeemPartialCall(engine, intent.marketId, intent.outcomeIdx, intent.amountRaw / w.series.lotBase);
      return { ok: true, value: { area: "engine", calls: [call], sponsored: true, summary: `redeem ${intent.amountRaw} of outcome ${intent.outcomeIdx}` } };
    }
    case "withdraw-credit": {
      // The whole credit of each listed Window, read head-fresh (the engine refuses more than is there).
      const positions = await readPositions(ctx.wallet, intent.marketIds);
      const credits = positions.filter((p) => p.credit > 0n).map((p) => ({ marketId: p.marketId, amountBase: p.credit }));
      const plan = planClaimAll({ engine, redeem: [], credits });
      if (plan.batches.length === 0) return { ok: false, diagnosis: diagnosis("already-claimed", "no engine credit on those Windows") };
      return { ok: true, value: { area: "engine", calls: plan.batches[0]!, batches: plan.batches, sponsored: true, summary: `withdraw credit on ${credits.length} Window(s)` } };
    }
    case "claim-all": {
      const plan = planClaimAll({ engine, redeem: intent.redeem, credits: intent.credits });
      if (plan.batches.length === 0) return { ok: false, diagnosis: diagnosis("already-claimed", "nothing to collect") };
      return {
        ok: true,
        value: { area: "engine", calls: plan.batches[0]!, batches: plan.batches, sponsored: true, summary: `collect ${plan.redeemed.length} payout(s) and ${plan.withdrawn.length} credit(s)` },
      };
    }
    case "cancel-orders": {
      if (intent.orderIds.length === 0 || intent.orderIds.length > MAX_CANCEL_IDS) return { ok: false, diagnosis: diagnosis("sponsor-refused", `cancel takes 1–${MAX_CANCEL_IDS} orders`) };
      return { ok: true, value: { area: "engine", calls: [cancelOrdersCall(engine, toMarketId(intent.marketId as Hex), intent.orderIds)], sponsored: true, summary: `cancel ${intent.orderIds.length} order(s)` } };
    }
    default:
      return null;
  }
}
