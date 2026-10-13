/**
 * Launch intents → calls for the one tx lane (S17; `relay/policies/launch.ts` decides what the relay pays):
 * - `launch-stablecoin`: the nine-call batch, self-paid — capital intake over five targets (D-063), the creator's root
 *   or access key signs it (X22: `createToken` is a precompile call, not CREATE);
 * - `launch-meme-create` / `-buy` / `-sell`, the launchpad claims and the locker's withdraw and fee claim: one call
 *   (an exact `approve` rides in front of a buy, a sell and a creator buy), sponsored — every payout goes to
 *   `msg.sender` after the receive-policy pre-check;
 * - `launch-pool-swap`: a graduated pool through the pinned UniversalRouter, paid by the trader (not a launch target).
 */
import type { TxIntent } from "@cwf/core";
import type { LaunchIntent } from "@cwf/core/launch";
import { diagnosis, formatBaseUnits, USD_DECIMALS } from "@cwf/core";
import { deploymentOf } from "../deployments";
import type { EncodeContext, EncodeResult } from "../submitter/encoders";
import type { Call } from "../tx/batch";
import { buildBuy, buildClaimFees, buildClaimLeftover, buildCreateLaunch, buildLockerClaimFees, buildLockerWithdraw, buildPoolSwap, buildSell, memeAddresses, memePoolKey, type BucketId } from "./meme";
import { buildStablecoinBatch } from "./stablecoin";

const isLaunch = (intent: TxIntent): intent is LaunchIntent => intent.kind.startsWith("launch-");
const usd = (base: bigint) => `$${formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;

/** The journal's one line, for the person who reads it back after a timeout. */
export function summarizeLaunch(intent: LaunchIntent): string {
  switch (intent.kind) {
    case "launch-stablecoin":
      return `launch the stablecoin ${intent.input.symbol} (${intent.input.name})`;
    case "launch-meme-create":
      return `launch the memecoin ${intent.symbol}${intent.creatorBuyQuote > 0n ? ` and buy ${usd(intent.creatorBuyQuote)} of it` : ""}`;
    case "launch-meme-buy":
      return `buy ${usd(intent.quoteIn)} of ${intent.token.slice(0, 10)} on its curve`;
    case "launch-meme-sell":
      return `sell ${intent.coinIn} of ${intent.token.slice(0, 10)} on its curve`;
    case "launch-claim-fees":
      return "claim the launchpad fees owed to this account";
    case "launch-claim-leftover":
      return `claim the leftover of ${intent.token.slice(0, 10)}`;
    case "launch-locker-withdraw":
      return `withdraw bucket ${intent.bucket} of ${intent.coin.slice(0, 10)} from the locker`;
    case "launch-locker-claim-fees":
      return `claim the locker's pool fees on ${intent.coin.slice(0, 10)}`;
    case "launch-pool-swap":
      return `${intent.buyCoin ? "buy" : "sell"} ${intent.token.slice(0, 10)} in its pool (${intent.amountIn} in)`;
  }
}

const strip = (calls: readonly { to: Call["to"]; data: Call["data"] }[]): Call[] => calls.map((c) => ({ to: c.to, data: c.data }));

/** The launch area's encoder for the tx lane (`submitter/encoders.ts`): claims every `launch-*` intent. */
export function encodeLaunchIntent(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (!isLaunch(intent)) return null;
  if (!deploymentOf("launch", ctx.chainId) || (ctx.chainId !== 42431 && ctx.chainId !== 4217)) return { ok: false, diagnosis: diagnosis("not-deployed", `the launchpads are not deployed on chain ${ctx.chainId}`) };
  const a = memeAddresses(ctx.chainId);
  const summary = summarizeLaunch(intent);
  try {
    switch (intent.kind) {
      case "launch-stablecoin": {
        const batch = buildStablecoinBatch({ ...intent.input, creator: ctx.wallet, salt: intent.salt, registry: a.registry });
        return { ok: true, value: { area: "launch", calls: strip(batch.calls), sponsored: false, summary } };
      }
      case "launch-meme-create": {
        const { calls } = buildCreateLaunch({ launchpad: a.launchpad, creator: ctx.wallet, configId: intent.configId, name: intent.name, symbol: intent.symbol, logoURI: intent.logoURI, metadataURI: intent.metadataURI, salt: intent.salt, creatorBuyQuote: intent.creatorBuyQuote, minCoinOut: intent.minCoinOut });
        return { ok: true, value: { area: "launch", calls: strip(calls), sponsored: true, summary } };
      }
      case "launch-meme-buy":
        if (intent.quoteIn <= 0n) return { ok: false, diagnosis: diagnosis("below-min-quantity", "the amount must be above zero") };
        return { ok: true, value: { area: "launch", calls: strip(buildBuy({ launchpad: a.launchpad, token: intent.token, quoteIn: intent.quoteIn, minCoinOut: intent.minCoinOut })), sponsored: true, summary } };
      case "launch-meme-sell":
        if (intent.coinIn <= 0n) return { ok: false, diagnosis: diagnosis("below-min-quantity", "nothing to sell") };
        return { ok: true, value: { area: "launch", calls: strip(buildSell({ launchpad: a.launchpad, token: intent.token, coinIn: intent.coinIn, minQuoteOut: intent.minQuoteOut })), sponsored: true, summary } };
      case "launch-claim-fees":
        return { ok: true, value: { area: "launch", calls: strip([buildClaimFees(a.launchpad)]), sponsored: true, summary } };
      case "launch-claim-leftover":
        return { ok: true, value: { area: "launch", calls: strip([buildClaimLeftover(a.launchpad, intent.token)]), sponsored: true, summary } };
      case "launch-locker-withdraw":
        return { ok: true, value: { area: "launch", calls: strip([buildLockerWithdraw(a.locker, intent.coin, intent.bucket as BucketId)]), sponsored: true, summary } };
      case "launch-locker-claim-fees":
        return { ok: true, value: { area: "launch", calls: strip([buildLockerClaimFees(a.locker, intent.coin)]), sponsored: true, summary } };
      case "launch-pool-swap": {
        if (intent.amountIn <= 0n) return { ok: false, diagnosis: diagnosis("below-min-quantity", "the amount must be above zero") };
        const calls = buildPoolSwap({ chainId: ctx.chainId, key: memePoolKey(intent.token, intent.fee, intent.tickSpacing), buyCoin: intent.buyCoin, amountIn: intent.amountIn, amountOutMinimum: intent.amountOutMinimum, nowSec: BigInt(Math.floor(Date.now() / 1000)) });
        return { ok: true, value: { area: "launch", calls: strip(calls), sponsored: false, summary } };
      }
    }
  } catch (error) {
    // `buildStablecoinBatch` and `buildCreateLaunch` refuse what the chain would revert on, with every reason.
    return { ok: false, diagnosis: diagnosis("contract-revert", error instanceof Error ? error.message : String(error)) };
  }
}
