"use client";
// Ported from Owarine 90a91d71:web/src/features/x/XInstructionBuilder.tsx — S11 (D-227): pick a ticker, a side, a
// Window and an amount; the post is the exact text the relay parses (`xInstructionText`), checked against the relay's
// own Window rule (`selectXWindow`) on the live lanes. Copying or opening X never places anything.
import { formatCadence, selectXWindow, TICKER_SYMBOLS, TICKERS, X_CADENCES, xInstructionText, type Side, type XAsset, type XCadence } from "@cwf/core";
import { useLanes } from "@cwf/markets/react";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { PillButton } from "@/components/kit/PillButton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { useClockValue } from "@/lib/clock";
import { openExternal } from "@/lib/open-external";
import { TFX } from "./copy";
import { XGlyph } from "./parts";

/** Names with a signed source on testnet (SPCX has none until Data Streams, Q-011). */
const ASSETS: readonly XAsset[] = TICKER_SYMBOLS.filter((s) => TICKERS[s].redstoneFeedId !== null);
const CRYPTO_FIRST = [...ASSETS.filter((s) => TICKERS[s].kind === "crypto"), ...ASSETS.filter((s) => TICKERS[s].kind === "stock")];
const AMOUNTS = ["5", "10", "25"] as const;
const CADENCES = Object.keys(X_CADENCES) as XCadence[];

export function XInstructionBuilder({ handle, enabled }: { handle: string; enabled: boolean }) {
  const lanes = useLanes();
  const nowMs = useClockValue((ms) => Math.floor(ms / 5_000) * 5_000);
  const [asset, setAsset] = useState<XAsset>("BTC");
  const [side, setSide] = useState<Side>("up");
  const [cadence, setCadence] = useState<XCadence>("5m");
  const [amount, setAmount] = useState<(typeof AMOUNTS)[number]>("5");
  const [copied, setCopied] = useState(false);
  const markets = lanes?.ok ? lanes.value.lanes.flatMap((l) => l.markets) : null;
  const open = (c: XCadence) => (markets ? selectXWindow(markets, { asset, intervalSec: X_CADENCES[c] }, nowMs).ok : null);
  const text = xInstructionText(handle, asset, side, cadence, amount);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section id="x-instruction" className="xi" aria-label={TFX.builder.title}>
      <h2 className="xi-title">{TFX.builder.title}</h2>
      <div className="xi-assets" role="group" aria-label="Asset">
        {CRYPTO_FIRST.map((s) => (
          <button key={s} type="button" className="xi-asset" aria-pressed={asset === s} onClick={() => setAsset(s)}>
            <AssetDisc asset={s} className="xi-disc" />
            {s}
          </button>
        ))}
      </div>
      <div className="xi-pair">
        <PillButton tone={side === "up" ? "up" : "ghost"} size="md" aria-pressed={side === "up"} onClick={() => setSide("up")}>UP</PillButton>
        <PillButton tone={side === "down" ? "down" : "ghost"} size="md" aria-pressed={side === "down"} onClick={() => setSide("down")}>DOWN</PillButton>
      </div>
      <SegmentedControl label="Window" value={cadence} onValueChange={setCadence} options={CADENCES.map((c) => ({ value: c, label: formatCadence(X_CADENCES[c]) }))} />
      {open(cadence) === false ? <p className="xt-note">{TFX.builder.closed}</p> : null}
      <div className="xi-amount" role="group" aria-label="Amount">
        {AMOUNTS.map((a) => (
          <button key={a} type="button" className="xt-chip numbers" aria-pressed={amount === a} onClick={() => setAmount(a)}>${a}</button>
        ))}
      </div>
      <div className="xi-post">
        <code>@{handle} {TICKERS[asset].kind === "stock" ? `$${asset}` : asset} <b>{side.toUpperCase()}</b> {cadence} ${amount}</code>
        <div className="xt-row">
          <PillButton tone="accent" size="md" disabled={!enabled} onClick={() => openExternal(`https://x.com/intent/post?text=${encodeURIComponent(text)}`)}>
            <XGlyph /> {TFX.builder.post}
          </PillButton>
          <PillButton tone="ghost" size="md" disabled={!enabled} onClick={() => void copy()}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? TFX.builder.copied : TFX.builder.copy}
          </PillButton>
        </div>
        {!enabled ? <p className="xt-note">{TFX.builder.setup}</p> : null}
      </div>
    </section>
  );
}
