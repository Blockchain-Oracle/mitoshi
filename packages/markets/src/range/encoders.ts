/**
 * Range intents → calls (plan C.2.3; Masayume 68f7a09:packages/markets/src/range/write.ts `sendRangeIntent`). An open is
 * ONE transaction: `[pathUSD.approve(reserve, maxStake), reserve.openRange(…, spotProof)]`, sponsored under
 * `relay/policies/range.ts` (D-173); settle, the stale void, claims and withdrawals are single sponsored calls; `supply`
 * is capital intake and is never sponsored.
 */
import { encodeFunctionData, type Hex } from "viem";
import { Addresses } from "viem/tempo";
import { diagnosis, type TxIntent } from "@cwf/core";
import { rangeSideIndex } from "@cwf/core/range";
import { rangeReserveAbi } from "@cwf/clients/abis/RangeReserve";
import { approveCall, type Call } from "../tx/batch";
import type { EncodeContext, EncodeResult } from "../submitter/encoders";
import { rangeVenueOf } from "./deployment";

const call = (to: Hex, functionName: string, args: readonly unknown[]): Call => ({
  to,
  data: encodeFunctionData({ abi: rangeReserveAbi, functionName: functionName as never, args: args as never }),
});

export function encodeRangeIntent(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (!intent.kind.startsWith("range-")) return null;
  const v = rangeVenueOf(ctx.chainId);
  if (!v) return { ok: false, diagnosis: diagnosis("not-deployed", `RangeReserve is not deployed on chain ${ctx.chainId}`) };
  const r = v.rangeReserve;
  const usd = Addresses.pathUsd as Hex;
  const one = (c: Call, summary: string): EncodeResult => ({ ok: true, value: { area: "range", calls: [c], sponsored: true, summary } });
  switch (intent.kind) {
    case "range-open": {
      const args = [intent.marketId, intent.asset, rangeSideIndex(intent.side), intent.lowPrint, intent.highPrint, intent.maxPayoutBase, intent.maxStakeBase, intent.spotProof];
      return { ok: true, value: { area: "range", calls: [approveCall(usd, r, intent.maxStakeBase), call(r, "openRange", args)], sponsored: true, summary: `open a ${intent.side} band on ${intent.asset} paying ${intent.maxPayoutBase}` } };
    }
    case "range-settle":
      return one(call(r, "settle", [intent.roundId]), `settle range round #${intent.roundId}`);
    case "range-void-stale":
      return one(call(r, "voidStale", [intent.roundId]), `void stale range round #${intent.roundId}`);
    case "range-claim":
      return one(call(r, "claim", [intent.roundId]), `claim range round #${intent.roundId} for its owner`);
    case "range-claim-owed":
      return one(call(r, "claimOwed", []), "collect a held range payout");
    case "range-withdraw":
      return one(call(r, "withdraw", [intent.shares]), `redeem ${intent.shares} range reserve shares`);
    case "range-supply":
      return { ok: true, value: { area: "range", calls: [approveCall(usd, r, intent.amountBase), call(r, "supply", [intent.amountBase])], sponsored: false, summary: `supply ${intent.amountBase} to the range reserve` } };
    default:
      return null;
  }
}
