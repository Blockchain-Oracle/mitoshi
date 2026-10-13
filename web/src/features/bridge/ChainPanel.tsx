"use client";
// One side of the bridge card (R4-12, D-227; from 21st.dev 16251 starc007/be-ui-multi-chain-swap's `Field`, revamped
// per D-044): the chain chip and whose account it is, the token pill and the amount (JetBrains Mono, `inputMode`
// decimal — no keypad, it would push the CTA off a phone), and the balance with Max. The receiving side shows what
// arrives, from the contract's own quote. Chain chips are lettermarks, never Robinhood's marks (Q-023).
import type { BridgeStop } from "@cwf/core";
import { shortHex } from "@cwf/core";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { AccountAvatar } from "@/components/shell/header/AccountAvatar";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { BRIDGE } from "./copy";

export function ChainChip({ stop, compact = false }: { stop: BridgeStop; compact?: boolean }) {
  return (
    <span className="brc-chain" data-stop={stop}>
      <span className="brc-chain-mark" aria-hidden>{BRIDGE.mark[stop]}</span>
      <span className={compact ? "sr-only" : "brc-chain-name"}>{BRIDGE.chain[stop]}</span>
    </span>
  );
}

export function Who({ address, you, onLink }: { address: string | null; you: boolean; onLink?: () => void }) {
  if (!address) return onLink ? <button type="button" className="brc-who-link" onClick={onLink}>{BRIDGE.link}</button> : null;
  return (
    <span className="brc-who" title={address}>
      {you ? <AccountAvatar seed={address} size={18} /> : null}
      <span className="numbers">{you ? BRIDGE.you : shortHex(address, 4, 4)}</span>
    </span>
  );
}

export interface FromPanelProps {
  stop: BridgeStop;
  who: ReactNode;
  symbol: string;
  amount: string;
  onAmount: (v: string) => void;
  onPick: () => void;
  balance: string | null;
  onMax: (() => void) | null;
}

export function FromPanel({ stop, who, symbol, amount, onAmount, onPick, balance, onMax }: FromPanelProps) {
  return (
    <div className="brc-panel" data-side="from">
      <div className="brc-panel-top">
        <span className="brc-label">{BRIDGE.from}</span>
        <ChainChip stop={stop} />
        <span className="brc-panel-who">{who}</span>
      </div>
      <div className="brc-panel-mid">
        <input
          className="numbers brc-amount"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0"
          aria-label={BRIDGE.amountLabel(symbol)}
          value={amount}
          onChange={(e) => onAmount(e.target.value.replace(/[^\d.]/g, ""))}
        />
        <button type="button" className="brc-token" onClick={onPick} aria-label={BRIDGE.pick}>
          <AssetDisc asset={symbol} className="brc-disc" />
          <span>{symbol}</span>
          <ChevronDown aria-hidden className="size-4 text-ink-muted" />
        </button>
      </div>
      <div className="brc-panel-foot">
        {balance !== null ? <span className="numbers">{BRIDGE.balance(balance)}</span> : <span />}
        {onMax ? <button type="button" className="brc-max" onClick={onMax}>{BRIDGE.max}</button> : null}
      </div>
    </div>
  );
}

export function ToPanel({ stop, who, gets }: { stop: BridgeStop; who: ReactNode; gets: string | null }) {
  return (
    <div className="brc-panel" data-side="to">
      <div className="brc-panel-top">
        <span className="brc-label">{BRIDGE.to}</span>
        <ChainChip stop={stop} />
        <span className="brc-panel-who">{who}</span>
      </div>
      <p className="numbers brc-gets" aria-live="polite">{gets ?? " "}</p>
    </div>
  );
}
