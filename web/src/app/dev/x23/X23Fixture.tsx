"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { SwapTicket, type SwapAsset } from "@/components/ui/swap-ticket";
import { useNowMs } from "@/lib/clock";

const FIXTURE_ASSETS: SwapAsset[] = [
  { symbol: "pathUSD", name: "Fixture dollars", decimals: 6, balanceBase: 250_000_000n },
  { symbol: "bTSLA", name: "Fixture stock token", decimals: 6, balanceBase: 1_500_000n },
];

export function X23Fixture() {
  const [pay, setPay] = useState(FIXTURE_ASSETS[0]!);
  const [receive, setReceive] = useState(FIXTURE_ASSETS[1]!);
  const [amount, setAmount] = useState("");
  const nowMs = useNowMs();
  const [quotedAtMs] = useState(() => (typeof performance === "undefined" ? 0 : Math.round(performance.timeOrigin)));
  const typed = amount === "" || amount === "." ? 0n : parseUnits(amount, pay.decimals);
  const over = pay.balanceBase !== null && typed > pay.balanceBase;
  const blocker = typed === 0n ? "Enter an amount" : over ? `Not enough ${pay.symbol}` : null;
  return (
    <SwapTicket
      assets={FIXTURE_ASSETS}
      pay={pay}
      receive={receive}
      amount={amount}
      onAmountChange={setAmount}
      onPick={(side, a) => (side === "pay" ? setPay(a) : setReceive(a))}
      onFlip={() => {
        setPay(receive);
        setReceive(pay);
      }}
      quote={typed > 0n ? { receiveBase: typed / 250n, minReceiveBase: (typed / 250n) * 995n / 1000n, guardBandBps: 150, quotedAtMs } : null}
      nowMs={nowMs}
      blocker={blocker}
      ctaLabel={`Buy ${receive.symbol}`}
      onSubmit={() => undefined}
    />
  );
}
