"use client";
// A memecoin's Buy/Sell sheet (S17; R4-11, D-227) on swap-ticket (21st 27122, revamped per D-044): pathUSD ⇄ the coin,
// the flip switches buying and selling. On the curve the quote is the curve's own maths at the fee now (anti-snipe
// included) — `quoteMemeBuy` / `quoteMemeSell` over the launch just read — sent as `launch-meme-buy` / `-sell` (the relay
// pays). After graduation it is Uniswap's V4Quoter on the pool, sent as `launch-pool-swap` (the trader pays). Minimum
// received is 1% under the quote. Sign-in comes at the CTA.
import type { Address } from "@cwf/core";
import { quoteMemeBuy, quoteMemeSell, withSlippage, type MemeLaunch } from "@cwf/markets/launch";
import { invalidateLaunch, invalidateAfterWrite, useBalanceSheet, useMemePosition, usePoolQuote } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SlideOver, SlideOverContent } from "@/components/kit";
import { TxFailureCard, useTxLifecycle } from "@/components/tx";
import { SwapTicket, type SwapAsset } from "@/components/ui/swap-ticket";
import { useWalletSession } from "@/lib/wallet-session";
import { LAUNCH } from "./copy";
import { bpsText, DECIMALS, parseAmount } from "./format";

const T = LAUNCH.trade;
const SLIPPAGE_BPS = 100;

export function TradeSheet({ m, open, onOpenChange, side }: { m: MemeLaunch; open: boolean; onOpenChange: (o: boolean) => void; side: "buy" | "sell" }) {
  const session = useWalletSession();
  const address = session.address as Address | null;
  const queryClient = useQueryClient();
  const tx = useTxLifecycle();
  const sheet = useBalanceSheet(address);
  const position = useMemePosition(m.token, address);
  const [buying, setBuying] = useState(side === "buy");
  const [amount, setAmount] = useState("");
  const sym = m.meta.symbol;
  const usd: SwapAsset = { symbol: "pathUSD", name: "pathUSD", decimals: DECIMALS, balanceBase: sheet?.ok ? sheet.value.spendableBase : null };
  const coin: SwapAsset = { symbol: sym, name: m.meta.name, decimals: DECIMALS, balanceBase: position?.ok && position.value ? position.value.coin : null };
  const amountIn = parseAmount(amount) ?? 0n;
  const graduated = m.stage === "graduated" && m.graduation !== null;
  const tier = m.graduation?.tier ?? 0;
  const poolParams = graduated ? { token: m.token, fee: m.config.poolFees[tier] ?? 0, tickSpacing: m.config.tickSpacings[tier] ?? 0, buyCoin: buying, amountIn } : null;
  const pool = usePoolQuote(poolParams);

  const quote = useMemo(() => {
    if (amountIn <= 0n) return null;
    if (graduated) return pool?.ok && pool.value !== null ? { receiveBase: pool.value, minReceiveBase: withSlippage(pool.value, SLIPPAGE_BPS), guardBandBps: SLIPPAGE_BPS, quotedAtMs: Date.now() } : null;
    if (m.stage !== "trading") return null;
    const out = buying ? quoteMemeBuy(m, amountIn).coinOut : quoteMemeSell(m, amountIn).quoteOut;
    return { receiveBase: out, minReceiveBase: withSlippage(out, SLIPPAGE_BPS), guardBandBps: SLIPPAGE_BPS, quotedAtMs: Date.now() };
  }, [amountIn, graduated, pool, m, buying]);

  const balance = buying ? usd.balanceBase : coin.balanceBase;
  const blocker = m.stage === "complete" ? LAUNCH.token.graduating : amountIn <= 0n ? T.enter : address && balance !== null && amountIn > balance ? `Over your ${buying ? "pathUSD" : `$${sym}`}` : null;

  const submit = async () => {
    if (!address) return session.connectFor(T.signIn);
    if (!quote) return;
    const intent = graduated
      ? { kind: "launch-pool-swap" as const, token: m.token, fee: poolParams!.fee, tickSpacing: poolParams!.tickSpacing, buyCoin: buying, amountIn, amountOutMinimum: quote.minReceiveBase }
      : buying
        ? { kind: "launch-meme-buy" as const, token: m.token, quoteIn: amountIn, minCoinOut: quote.minReceiveBase }
        : { kind: "launch-meme-sell" as const, token: m.token, coinIn: amountIn, minQuoteOut: quote.minReceiveBase };
    const outcome = await tx.run(intent);
    if (outcome?.status === "confirmed") {
      setAmount("");
      await Promise.all([invalidateLaunch(queryClient), invalidateAfterWrite(queryClient, { wallet: address })]);
    }
  };

  return (
    <SlideOver open={open} onOpenChange={onOpenChange} urlKey="trade">
      <SlideOverContent title={T.title(sym)} description={graduated ? T.poolSwap : `${T.fee(bpsText(m.feeBpsNow))} · ${T.slippage}`} fields>
        <SwapTicket
          assets={[usd, coin]}
          pay={buying ? usd : coin}
          receive={buying ? coin : usd}
          amount={amount}
          onAmountChange={setAmount}
          onPick={(at, asset) => setBuying((at === "pay") === (asset.symbol === "pathUSD"))}
          onFlip={() => (setBuying((b) => !b), setAmount(""))}
          quote={quote}
          nowMs={Date.now()}
          blocker={address ? blocker : blocker === T.enter ? blocker : null}
          ctaLabel={!address ? T.signIn : buying ? T.buy(`${amount || "0"} pathUSD`) : T.sell(sym)}
          onSubmit={() => void submit()}
          pending={tx.state.kind === "signing" || tx.state.kind === "submitted"}
        />
        {tx.state.kind === "failed" ? <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} /> : null}
      </SlideOverContent>
    </SlideOver>
  );
}
