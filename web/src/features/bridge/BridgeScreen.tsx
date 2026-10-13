"use client";
/**
 * `/bridge` (R4-12, D-227; S14 14w): stocks between Robinhood Chain and Tempo as one card in the Across/Relay/Stargate
 * shape (from 21st.dev 16251, revamped) with Owarine 90a91d71 `CcRailPanel`'s header and honesty. Phone: the head row
 * and the card (≈330 px, the CTA inside the first screen); Recent, this stock's reserve and "How it works" below. From
 * 768 the card is centred at 480; from 1024 it sits left at 440 with Recent and the reserve in a right column. The
 * stage pads; nothing here adds an outer inset. `?t=TSLA` picks the stock; `?tx=<hash>` reopens a recorded transfer.
 */
import { isBridgeTicker, type BridgeTicker } from "@cwf/core";
import Link from "next/link";
import { useMemo } from "react";
import { BridgeCard } from "./BridgeCard";
import { BRIDGE } from "./copy";
import { RecentTransfers } from "./RecentTransfers";
import { ReservePeek } from "./ReservePeek";
import { useBridge, useBridgeApi } from "./useBridge";
import { useTracker } from "./useTracker";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import "@/styles/bridge-kit.css";
import "./bridge.css";

function fromUrl(): { ticker: BridgeTicker; tx: string | null } {
  const q = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const t = q?.get("t")?.toUpperCase() ?? "";
  const tx = q?.get("tx") ?? null;
  return { ticker: isBridgeTicker(t) ? t : "TSLA", tx: tx && /^0x[0-9a-fA-F]{64}$/.test(tx) ? tx : null };
}

export function BridgeScreen() {
  const start = useMemo(fromUrl, []);
  const shell = useWalletShell();
  const api = useBridgeApi([shell.tempo?.address, shell.robinhood?.address]);
  const tracker = useTracker(api.data?.eta ?? null, start.tx);
  const model = useBridge(start.ticker, tracker.start);
  return (
    <div className="brs-page">
      <header className="brs-head">
        <div className="brs-head-text">
          <h1 className="brs-title">{BRIDGE.title}</h1>
          <p className="brs-line">{BRIDGE.line}</p>
        </div>
        <Link href="/reserves" className="brs-link">{BRIDGE.reserves}</Link>
      </header>
      <div className="brs-grid">
        <BridgeCard model={model} tracker={tracker} />
        <aside className="brs-side">
          <RecentTransfers api={api.isPending ? undefined : (api.data ?? null)} onOpen={tracker.start} />
          <ReservePeek ticker={tracker.tracked?.ticker ?? model.ticker} />
        </aside>
      </div>
    </div>
  );
}
