/**
 * Bridge intents → Tempo calls (plan C.2.3; S14w; D-227 R4-12).
 * - `bridge-send`: ONE transaction, one passkey prompt — `[pathUSD.approve(adapter, fee), bT.approve(adapter, amount),
 *   adapter.send(…to the Base composer…)]`; the holder pays the LayerZero fee in pathUSD and the gas: never sponsored.
 * - `bridge-claim-deferred`: `adapter.claimDeferred()`, sponsored (an exit never waits on a fee).
 * - `bridge-send-deferred`: `[pathUSD.approve(adapter, fee), adapter.sendDeferred(…)]`, the gas sponsored; the
 *   LayerZero fee is still the holder's pathUSD (LzdFee pulls it).
 * Approvals are exact, never unlimited (the relay refuses max approvals anyway).
 */
import { encodeFunctionData, erc20Abi, isAddress, type Address, type Hex } from "viem";
import { diagnosis, NETWORKS, type TxIntent } from "@cwf/core";
import { TEMPO } from "@cwf/clients";
import { tIP20MintBurnAdapterAbi } from "@cwf/clients/abis/TIP20MintBurnAdapter";
import type { Call } from "../tx/batch";
import type { EncodeContext, EncodeResult } from "../submitter/encoders";
import { outSendParam } from "./params";
import { bridgeTopology } from "./topology";

const approve = (token: Address, spender: Address, amount: bigint): Call => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }) });
const adapterCall = (adapter: Address, functionName: "send" | "sendDeferred" | "claimDeferred", args: readonly unknown[]): Call => ({
  to: adapter,
  data: encodeFunctionData({ abi: tIP20MintBurnAdapterAbi, functionName: functionName as never, args: args as never }) as Hex,
});

export function encodeBridgeIntent(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (!intent.kind.startsWith("bridge-")) return null;
  const network = ctx.chainId === NETWORKS.mainnet ? "mainnet" : ctx.chainId === NETWORKS.testnet ? "testnet" : null;
  if (!network) return { ok: false, diagnosis: diagnosis("wrong-chain", `chain ${ctx.chainId} is not Tempo`) };
  if (!("ticker" in intent)) return null;
  const t = bridgeTopology(network).tickers[intent.ticker];
  if (!t?.adapter || !t.mirror) return { ok: false, diagnosis: diagnosis("not-deployed", `the ${intent.ticker} bridge is not deployed on chain ${ctx.chainId}`) };
  const usd = TEMPO.pathUSD as Address;
  switch (intent.kind) {
    case "bridge-send":
    case "bridge-send-deferred": {
      if (!isAddress(intent.recipient) || /^0x0{40}$/i.test(intent.recipient)) return { ok: false, diagnosis: diagnosis("contract-revert", `not a Robinhood Chain address: ${intent.recipient}`) };
      if (intent.amountSD <= 0n) return { ok: false, diagnosis: diagnosis("below-min-quantity", "nothing to bridge") };
      if (!t.hopComposer) return { ok: false, diagnosis: diagnosis("not-deployed", `the ${intent.ticker} hop on Base is not deployed yet`) };
      const sp = outSendParam(t, intent.amountSD, intent.recipient);
      const fee = { nativeFee: intent.feeBase, lzTokenFee: 0n };
      if (intent.kind === "bridge-send") {
        const calls = [approve(usd, t.adapter, intent.feeBase), approve(t.mirror, t.adapter, intent.amountSD), adapterCall(t.adapter, "send", [sp, fee, ctx.wallet])];
        return { ok: true, value: { area: "stocks", calls, sponsored: false, summary: `bridge ${intent.amountSD} b${intent.ticker} to ${intent.recipient} on Robinhood Chain` } };
      }
      const calls = [approve(usd, t.adapter, intent.feeBase), adapterCall(t.adapter, "sendDeferred", [sp, fee, ctx.wallet])];
      return { ok: true, value: { area: "stocks", calls, sponsored: true, summary: `send ${intent.amountSD} deferred b${intent.ticker} back to ${intent.recipient}` } };
    }
    case "bridge-claim-deferred":
      return { ok: true, value: { area: "stocks", calls: [adapterCall(t.adapter, "claimDeferred", [])], sponsored: true, summary: `claim deferred b${intent.ticker}` } };
    default:
      return null;
  }
}
