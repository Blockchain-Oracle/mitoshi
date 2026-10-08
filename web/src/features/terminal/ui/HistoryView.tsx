"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/ui/sheets/AccountSheet.tsx (Trade history: the stats
// strip and the list) — on Mitoshi's indexed history (`useWalletHistory`: closed and settled rounds, PnL = proceeds +
// payout − stake). A history that hit a paging cap says it covers a prefix.
import { formatCadence } from "@cwf/core/copy";
import type { Address } from "@cwf/core";
import { useWalletHistory } from "@cwf/markets/react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { TERMINAL } from "../copy";
import { clockText, money } from "../format";
import { episodeFor, replayable, useEpisodes, type Episode } from "../replay";

export function HistoryView({ wallet, onReplay }: { wallet: Address; onReplay: (episode: Episode, finalPnl: number) => void }) {
  const masked = usePrivacy();
  const episodes = useEpisodes();
  const reading = useWalletHistory(wallet);
  if (!reading) return <p className="tm-empty">…</p>;
  if (!reading.ok) return <p className="tm-empty">{reading.error.technical}</p>;
  const { rounds, complete } = reading.value;
  if (rounds.length === 0) return <p className="tm-empty">{TERMINAL.history.none}</p>;
  const decided = rounds.filter((r) => r.outcome === "win" || r.outcome === "loss" || r.outcome === "closed");
  const wins = decided.filter((r) => r.pnlBase > 0n).length;
  const pnl = rounds.reduce((s, r) => s + r.pnlBase, 0n);
  const best = rounds.reduce((m, r) => (r.pnlBase > m ? r.pnlBase : m), 0n);
  const hide = (text: string) => (masked ? SHELL.masked : text);
  return (
    <div className="tm-history">
      <div className="tm-stats">
        <span><b>{rounds.length}</b>{TERMINAL.history.trades}</span>
        <span><b>{decided.length ? Math.round((wins / decided.length) * 100) : 0}%</b>{TERMINAL.history.winRate}</span>
        <span><b className={pnl >= 0n ? "is-up" : "is-down"}>{hide(money(pnl, true))}</b>{TERMINAL.history.pnl}</span>
        <span><b>{hide(money(best))}</b>{TERMINAL.history.best}</span>
      </div>
      {complete ? null : <p className="tm-field-hint">{TERMINAL.history.partial(rounds.length)}</p>}
      <div className="tm-card" role="list">
        {rounds.map((r) => {
          const up = r.sidesTraded[0] !== 1;
          const Dir = up ? ArrowUp : ArrowDown;
          const tag = r.outcome === "closed" ? TERMINAL.history.closed : r.outcome === "win" ? TERMINAL.history.won : r.outcome === "loss" ? TERMINAL.history.lost : TERMINAL.history.void;
          return (
            <div key={`${r.marketId}:${r.openedAtMs}`} role="listitem" className="tm-pos">
              <span className={`tm-pos-side ${up ? "tm-up-soft" : "tm-down-soft"}`}><Dir aria-hidden strokeWidth={3} /></span>
              <span className="tm-pos-main">
                <span className="tm-pos-title">{up ? "Up" : "Down"} {r.asset} <span className="tm-pos-tag is-plain">{tag}</span></span>
                <span className="tm-pos-meta">{formatCadence(r.intervalSec)} · {TERMINAL.positions.staked} {hide(money(r.stakeBase))} · {clockText(r.expirySec)}</span>
              </span>
              <span className={`tm-pos-figure ${r.pnlBase >= 0n ? "is-up" : "is-down"}`}>{hide(money(r.pnlBase, true))}</span>
              {(() => {
                const e = episodeFor(episodes, r.marketId);
                return e && replayable(e) ? (
                  <button type="button" className="tm-choice" onClick={() => onReplay(e, Number(r.pnlBase) / 10 ** r.decimals)}>{TERMINAL.replay.open}</button>
                ) : <span />;
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
