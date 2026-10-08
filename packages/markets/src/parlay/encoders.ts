/**
 * Parlay intents → calls (plan C.2.3; Masayume 68f7a09:packages/markets/src/parlay/write.ts `sendParlayIntent`). On
 * Tempo an open is ONE transaction: `[pathUSD.approve(reserve, maxStake), reserve.openParlay(legs, maxPayout,
 * maxStake, spotProofs)]` — the exact approval rides along (never max, relay `approve-max`), and the relay sponsors the
 * pair under `relay/policies/parlay.ts` (D-166). Settlement, claims and withdrawals are single sponsored calls; `supply`
 * is capital intake and is never sponsored.
 */
import { encodeFunctionData, type Hex } from "viem";
import { Addresses } from "viem/tempo";
import { diagnosis, type TxIntent } from "@cwf/core";
import { parlayReserveAbi } from "@cwf/clients/abis/ParlayReserve";
import { approveCall, type Call } from "../tx/batch";
import type { EncodeContext, EncodeResult } from "../submitter/encoders";
import { parlayVenueOf } from "./deployment";
import { legTuples } from "./read";

const call = (to: Hex, functionName: string, args: readonly unknown[]): Call => ({
  to,
  data: encodeFunctionData({ abi: parlayReserveAbi, functionName: functionName as never, args: args as never }),
});

export function encodeParlayIntent(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (!intent.kind.startsWith("parlay-")) return null;
  const v = parlayVenueOf(ctx.chainId);
  if (!v) return { ok: false, diagnosis: diagnosis("not-deployed", `ParlayReserve is not deployed on chain ${ctx.chainId}`) };
  const r = v.parlayReserve;
  const usd = Addresses.pathUsd as Hex;
  switch (intent.kind) {
    case "parlay-open": {
      if (intent.spotProofs.length !== intent.legs.length) {
        return { ok: false, diagnosis: diagnosis("requote", `BadProofCount(${intent.spotProofs.length}, ${intent.legs.length})`, { errorName: "BadProofCount" }) };
      }
      const calls = [approveCall(usd, r, intent.maxStakeBase), call(r, "openParlay", [legTuples(intent.legs), intent.maxPayoutBase, intent.maxStakeBase, intent.spotProofs])];
      return { ok: true, value: { area: "parlay", calls, sponsored: true, summary: `open a ${intent.legs.length}-leg parlay paying ${intent.maxPayoutBase} for at most ${intent.maxStakeBase}` } };
    }
    case "parlay-resolve-leg":
      return { ok: true, value: { area: "parlay", calls: [call(r, "resolveLeg", [intent.parlayId, BigInt(intent.legIdx)])], sponsored: true, summary: `settle leg ${intent.legIdx + 1} of parlay #${intent.parlayId}` } };
    case "parlay-claim":
      return { ok: true, value: { area: "parlay", calls: [call(r, "claim", [intent.parlayId])], sponsored: true, summary: `claim parlay #${intent.parlayId} for its owner` } };
    case "parlay-claim-owed":
      return { ok: true, value: { area: "parlay", calls: [call(r, "claimOwed", [])], sponsored: true, summary: "collect a held parlay payout" } };
    case "parlay-supply":
      return { ok: true, value: { area: "parlay", calls: [approveCall(usd, r, intent.amountBase), call(r, "supply", [intent.amountBase])], sponsored: false, summary: `supply ${intent.amountBase} to the parlay reserve` } };
    case "parlay-withdraw":
      return { ok: true, value: { area: "parlay", calls: [call(r, "withdraw", [intent.shares])], sponsored: true, summary: `redeem ${intent.shares} reserve shares` } };
    default:
      return null;
  }
}
