"use client";
// DEMO's settlement (D-223; Owarine 90a91d71 TerminalScreen's demo effect): a paper position still open after its
// Window's close settles on the Window's real result — the winner's contracts pay a dollar each, a void pays ½ on both
// sides, exactly as the engine does on chain. Checked every 5 s while any paper position is due.
import { isOk, type MarketId } from "@cwf/core";
import { useMarketsPort } from "@cwf/markets/react";
import { useEffect } from "react";
import { closeFeedback } from "@/lib/feedback";
import { notify } from "@/lib/toast";
import { TERMINAL } from "./copy";
import { demoState, settlePaper, useDemoState } from "./demo";
import { money } from "./format";

const CHECK_MS = 5_000;

export function useDemoSettle(active: boolean): void {
  const port = useMarketsPort();
  const { positions } = useDemoState();
  const due = active && positions.length > 0;
  useEffect(() => {
    if (!due || !port) return;
    let alive = true;
    const settling = new Set<string>();
    const check = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      for (const p of demoState().positions) {
        if (nowSec <= p.expirySec + 5 || settling.has(p.id)) continue;
        settling.add(p.id);
        void port.getMarket(p.marketId as MarketId).then((r) => {
          settling.delete(p.id);
          if (!alive || !isOk(r) || !r.value || r.value.state === "open") return;
          const m = r.value;
          const held = BigInt(p.contractsRaw);
          const payout = m.state === "voided" ? held / 2n : (m.winningOutcome === 0) === (p.side === "up") ? held : 0n;
          const pnl = payout - BigInt(p.costBase);
          settlePaper(p.id, { kind: "settle", asset: p.asset, side: p.side, intervalSec: p.intervalSec, costBase: p.costBase, pnlBase: pnl.toString(), openedAtMs: p.openedAtMs, closedAtMs: Date.now(), voided: m.state === "voided" || undefined });
          closeFeedback(Number(pnl));
          notify.item({ title: TERMINAL.toast.settledDemo(p.asset), description: m.state === "voided" ? TERMINAL.toast.voidedDemo : TERMINAL.close.realized(money(pnl, true), money(payout)) });
        });
      }
    };
    check();
    const t = setInterval(check, CHECK_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [due, port]);
}
