/**
 * The owner's own private-mode calls → the one tx lane (Masayume 68f7a09:packages/markets/src/private/write.ts): a
 * top-up is `[approve(desk, amount), depositAndAllow(amount, allowance)]` (capital intake — never sponsored, D-177, the
 * owner pays); `allow` (a delegation to the desk key) is never sponsored either; `withdraw`, `revoke` and the
 * permissionless `settleSlot` are. The desk's own calls never ride this lane — the desk service sends them (C.3.8).
 */
import { encodeFunctionData, type Hex } from "viem";
import { diagnosis, type TxIntent } from "@cwf/core";
import { privateDeskAbi } from "@cwf/clients/abis/PrivateDesk";
import { approveCall, type Call } from "../tx/batch";
import type { EncodeContext, EncodeResult } from "../submitter/encoders";
import { privateDeskOf } from "./deployment";
import { TEMPO } from "@cwf/clients";

const call = (to: Hex, functionName: string, args: readonly unknown[]): Call => ({ to, data: encodeFunctionData({ abi: privateDeskAbi, functionName: functionName as never, args: args as never }) });

export function encodePrivateIntent(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (!intent.kind.startsWith("private-")) return null;
  const d = privateDeskOf(ctx.chainId);
  if (!d) return { ok: false, diagnosis: diagnosis("not-deployed", `PrivateDesk is not deployed on chain ${ctx.chainId}`) };
  const desk = d.privateDesk;
  const usd = TEMPO.pathUSD as Hex;
  switch (intent.kind) {
    case "private-deposit-and-allow": {
      const calls = intent.amountBase > 0n ? [approveCall(usd, desk, intent.amountBase), call(desk, "depositAndAllow", [intent.amountBase, intent.allowanceBase])] : [call(desk, "allow", [intent.allowanceBase])];
      return { ok: true, value: { area: "private", calls, sponsored: false, summary: `private top-up ${intent.amountBase}, limit ${intent.allowanceBase}` } };
    }
    case "private-allow":
      return { ok: true, value: { area: "private", calls: [call(desk, "allow", [intent.allowanceBase])], sponsored: false, summary: `private limit ${intent.allowanceBase}` } };
    case "private-revoke":
      return { ok: true, value: { area: "private", calls: [call(desk, "revoke", [])], sponsored: true, summary: "revoke the desk's private limit" } };
    case "private-withdraw":
      return { ok: true, value: { area: "private", calls: [call(desk, "withdraw", [intent.amountBase])], sponsored: true, summary: `withdraw ${intent.amountBase} from private` } };
    case "private-settle":
      return { ok: true, value: { area: "private", calls: [call(desk, "settleSlot", [intent.slotId])], sponsored: true, summary: `settle a private slot` } };
    default:
      return null;
  }
}
