"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/ui/sheets/AccountSheet.tsx (Trade history: the stats
// strip and the list) — on Mitoshi's indexed history (`useWalletHistory`: closed and settled rounds, PnL = proceeds +
// payout − stake). Tradash's grid (RV-82): Lifetime PnL, Win rate, Trades, Win streak, Best streak, Volume (Σ staked),
// the streaks from `@cwf/core`'s `winStreaks` (decided rounds only, as the leaderboard counts them); each row's ROI
// under its PnL; 5 skeleton rows while the history loads; Tradash's empty line. A history that hit a paging cap says
// it covers a prefix.
import { formatCadence } from "@cwf/core/copy";
import { winStreaks, type Address } from "@cwf/core";
import { useWalletHistory } from "@cwf/markets/react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { TERMINAL } from "../copy";
import { clockText, money, moneyTone } from "../format";
import { episodeFor, replayable, useEpisodes, type Episode } from "../replay";

const roiText = (pnl: bigint, stake: bigint) => {
  if (stake <= 0n) return null;
  const bps = Number((pnl * 10_000n) / stake);
  return `${bps >= 0 ? "+" : "−"}${(Math.abs(bps) / 100).toFixed(1)}%`;
};

export function HistoryView({ wallet, onReplay }: { wallet: Address; onReplay: (episode: Episode, finalPnl: number) => void }) {
  const masked = usePrivacy();
  const episodes = useEpisodes();
  const reading = useWalletHistory(wallet);
  if (!reading) {
    return (
      <div className="tm-history" role="status" aria-label={TERMINAL.history.title}>
        {Array.from({ length: 5 }, (_, i) => <div key={i} aria-hidden className="tm-skel-row" />)}
      </div>
    );
  }
  if (!reading.ok) return <p className="tm-empty">{reading.error.technical}</p>;
  const { rounds, complete } = reading.value;
  if (rounds.length === 0) return <p className="tm-empty">{TERMINAL.history.none}</p>;
  const decided = rounds.filter((r) => r.outcome === "win" || r.outcome === "loss" || r.outcome === "closed");
  const wins = decided.filter((r) => r.pnlBase > 0n).length;
  const pnl = rounds.reduce((s, r) => s + r.pnlBase, 0n);
  const volume = rounds.reduce((s, r) => s + r.stakeBase, 0n);
  const streaks = winStreaks(rounds);
  const hide = (text: string) => (masked ? SHELL.masked : text);
  const stats: Array<[string, ReactNode]> = [
    [TERMINAL.history.lifetime, <b key="pnl" className={moneyTone(pnl)}>{hide(money(pnl, true))}</b>],
    [TERMINAL.history.winRate, <b key="rate">{decided.length ? `${Math.round((wins / decided.length) * 100)}%` : "—"}</b>],
    [TERMINAL.history.trades, <b key="n">{rounds.length}</b>],
    [TERMINAL.history.streak, <b key="s">{streaks.current}</b>],
    [TERMINAL.history.bestStreak, <b key="b">{streaks.best}</b>],
    [TERMINAL.history.volume, <b key="v">{hide(money(volume))}</b>],
  ];
  return (
    <div className="tm-history">
      <div className="tm-stats tm-stats-grid">
        {stats.map(([label, value]) => <span key={label}>{value}{label}</span>)}
      </div>
      {complete ? null : <p className="tm-field-hint">{TERMINAL.history.partial(rounds.length)}</p>}
      <div className="tm-card" role="list">
        {rounds.map((r) => {
          const up = r.sidesTraded[0] !== 1;
          const Dir = up ? ArrowUp : ArrowDown;
          const tag = r.outcome === "closed" ? TERMINAL.history.closed : r.outcome === "win" ? TERMINAL.history.won : r.outcome === "loss" ? TERMINAL.history.lost : TERMINAL.history.void;
          const roi = roiText(r.pnlBase, r.stakeBase);
          return (
            <div key={`${r.marketId}:${r.openedAtMs}`} role="listitem" className="tm-pos">
              <span className={`tm-pos-side ${up ? "tm-up-soft" : "tm-down-soft"}`}><Dir aria-hidden strokeWidth={3} /></span>
              <span className="tm-pos-main">
                <span className="tm-pos-title">{up ? "Up" : "Down"} {r.asset} <span className="tm-pos-tag is-plain">{tag}</span></span>
                <span className="tm-pos-meta">{formatCadence(r.intervalSec)} · {TERMINAL.positions.staked} {hide(money(r.stakeBase))} · {clockText(r.expirySec)}</span>
              </span>
              <span className={`tm-pos-figure ${moneyTone(r.pnlBase)}`}>
                {hide(money(r.pnlBase, true))}
                {roi && !masked ? <span className="tm-pos-pnl">{roi}</span> : null}
              </span>
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
