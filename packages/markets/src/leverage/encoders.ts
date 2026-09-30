/**
 * Boost intents → calls (plan C.2.3; Masayume 68f7a09:packages/markets/src/leverage/write.ts). An open is ONE
 * transaction: `[pathUSD.approve(reserve, stake), reserve.open(marketId, outcome, stake, leverageBps, minQuantity,
 * spotProof)]`, sponsored under `relay/policies/leverage.ts` (D-175); close, knock-out (with the cranker's own spot),
 * settle and claims are single sponsored calls; `supply` is capital intake and never sponsored.
 */
import { encodeFunctionData, type Hex } from "viem";
import { Addresses } from "viem/tempo";
import { diagnosis, SIDE_TO_OUTCOME, type TxIntent } from "@cwf/core";
import { leverageReserveAbi } from "@cwf/clients/abis/LeverageReserve";
import { approveCall, type Call } from "../tx/batch";
import type { EncodeContext, EncodeResult } from "../submitter/encoders";
import { leverageVenueOf } from "./deployment";

const call = (to: Hex, functionName: string, args: readonly unknown[]): Call => ({ to, data: encodeFunctionData({ abi: leverageReserveAbi, functionName: functionName as never, args: args as never }) });

export function encodeLeverageIntent(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (!intent.kind.startsWith("leverage-")) return null;
  const v = leverageVenueOf(ctx.chainId);
  if (!v) return { ok: false, diagnosis: diagnosis("not-deployed", `LeverageReserve is not deployed on chain ${ctx.chainId}`) };
  const r = v.leverageReserve;
  const usd = Addresses.pathUsd as Hex;
  const one = (c: Call, summary: string): EncodeResult => ({ ok: true, value: { area: "leverage", calls: [c], sponsored: true, summary } });
  switch (intent.kind) {
    case "leverage-open":
      return {
        ok: true,
        value: {
          area: "leverage",
          calls: [approveCall(usd, r, intent.stakeBase), call(r, "open", [intent.marketId, SIDE_TO_OUTCOME[intent.side], intent.stakeBase, intent.leverageBps, intent.minQuantityRaw, intent.spotProof])],
          sponsored: true,
          summary: `boost ${intent.side} ${intent.leverageBps / 10_000}× with ${intent.stakeBase}`,
        },
      };
    case "leverage-close":
      return one(call(r, "close", [intent.positionId, intent.minProceedsBase]), `cash out boost #${intent.positionId}`);
    case "leverage-knock-out":
      return one(call(r, "knockOut", [intent.positionId, intent.spotProof]), `knock out boost #${intent.positionId}`);
    case "leverage-settle":
      return one(call(r, "settle", [intent.positionId]), `settle boost #${intent.positionId}`);
    case "leverage-claim-owed":
      return one(call(r, "claimOwed", []), "collect a held boost payout");
    case "leverage-withdraw":
      return one(call(r, "withdraw", [intent.shares]), `redeem ${intent.shares} boost reserve shares`);
    case "leverage-supply":
      return { ok: true, value: { area: "leverage", calls: [approveCall(usd, r, intent.amountBase), call(r, "supply", [intent.amountBase])], sponsored: false, summary: `supply ${intent.amountBase} to the boost reserve` } };
    default:
      return null;
  }
}
