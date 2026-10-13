"use client";

// The duel's screens around the swipe (R4-9, D-227): the entry (pot chips and one CTA), the queue (Senryo's breathing
// search plate with the venue's next deck), the lobby (the versus — two marble portraits, the sealed deck, the one
// action this seat owes the chain) and the result (each card, both P&Ls on the Odometer, the cranks anyone may send).
// Ported from Owarine 90a91d71:web/src/features/games/duel/{DuelEntry,DuelQueue,DuelLobby,DuelResult}.tsx and
// duel.css, on Mitoshi's tokens; the moments are the spec's (queue breath, 700 ms versus entrance, results 600 ms apart).
import { STAKE_TIERS, type StakeTierId } from "@cwf/core/games";
import { formatBaseUnits } from "@cwf/core/units";
import { Info } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Odometer } from "@/components/kit/Odometer";
import { ConfettiBurst } from "@/components/ui/confetti-burst";
import { AccountAvatar } from "@/components/shell/header/AccountAvatar";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { SearchingBanner } from "../art/PixelArt";
import { tickerOf } from "../lanes";
import { DUEL } from "./copy";
import type { DuelMatchWire, DuelQueueWire } from "./duel-wire";
import "@/components/kit/kit.css";

export const dollars = (base: string | bigint) => `$${formatBaseUnits(BigInt(base), 6, { minDp: 0 })}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
/** Display only: base units (6 dp) to a number for the Odometer; the money stays bigint everywhere else. */
const toNumber = (base: string) => Number(BigInt(base)) / 1e6;

export function DuelEntry({ tier, onTier, onFind, busy, error }: { tier: StakeTierId; onTier: (t: StakeTierId) => void; onFind: () => void; busy: boolean; error: string | null }) {
  return (
    <section className="du-entry" aria-label={DUEL.title}>
      <div className="du-entry-art" aria-hidden>
        <SearchingBanner className="du-searching-art" />
      </div>
      <div className="du-chips" role="radiogroup" aria-label={DUEL.entry.tier}>
        {STAKE_TIERS.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={tier === t.id} className="du-chip" data-on={tier === t.id || undefined} onClick={() => onTier(t.id)}>
            {DUEL.entry.tierWord(t.id, t.potUnits)}
          </button>
        ))}
      </div>
      <button type="button" className="du-cta" onClick={onFind} disabled={busy} data-primary-action>
        {DUEL.entry.find}
      </button>
      <p className="du-note">{error ?? DUEL.entry.note}</p>
    </section>
  );
}

export function DuelQueue({ queue, me, nextDealSec, onLeave }: { queue: Extract<DuelQueueWire, { status: "waiting" }>; me: string; nextDealSec: number | null; onLeave: () => void }) {
  const tier = STAKE_TIERS.find((t) => t.id === queue.tier);
  return (
    <section className="du-queue" aria-label={DUEL.queue.title} aria-live="polite">
      <div className="du-searching du-breathe" aria-hidden>
        <SearchingBanner className="du-searching-art" />
        <span className="du-queue-me">
          <AccountAvatar seed={me} size={40} className="du-portrait" />
          <span className="du-chip du-chip--stake" data-on>
            {DUEL.entry.tierWord(queue.tier, tier?.potUnits ?? 0)}
          </span>
        </span>
        <span className="du-dots">
          <span />
          <span />
          <span />
        </span>
      </div>
      <h2 className="du-title">{DUEL.queue.title}</h2>
      <p className="du-note">
        {queue.refusal ? DUEL.queue.noDeck(queue.refusal) : null}
        {nextDealSec !== null ? ` · ${DUEL.queue.deckIn(nextDealSec)}` : null}
      </p>
      <button type="button" className="du-ghost" onClick={onLeave}>
        {DUEL.queue.leave}
      </button>
    </section>
  );
}

function Seat({ label, address, note }: { label: string; address: string; note?: ReactNode }) {
  return (
    <div className="du-seat">
      <AccountAvatar seed={address || label} size={72} className="du-portrait" />
      <span className="du-seat-label">{label}</span>
      <span className="du-seat-addr">{address ? short(address) : DUEL.result.none}</span>
      {note ? <span className="du-seat-note">{note}</span> : null}
    </div>
  );
}

export function Versus({ me, opponent }: { me: string; opponent: string }) {
  return (
    <div className="du-versus">
      <Seat label={DUEL.lobby.you} address={me} />
      <span className="du-vs" aria-hidden>
        {DUEL.lobby.vs}
      </span>
      <Seat label={DUEL.lobby.opponent} address={opponent} />
    </div>
  );
}

export function DeckRow({ match }: { match: DuelMatchWire }) {
  return (
    <ol className="du-deck" aria-label={DUEL.lobby.cards(match.deck.length)}>
      {match.deck.map((c) => (
        <li key={c.index} className="du-deck-card">
          <AssetDisc asset={c.asset} className="gm-disc du-deck-disc" />
          <span>{tickerOf(c.asset)}</span>
        </li>
      ))}
    </ol>
  );
}

export function Proof({ match }: { match: DuelMatchWire }) {
  return (
    <details className="du-proof">
      <summary>
        <Info aria-hidden className="du-proof-icon" />
        {DUEL.proof.open}
      </summary>
      <dl className="du-kv">
        <dt>{DUEL.proof.match}</dt>
        <dd>{match.matchId}</dd>
        {match.reveal ? (
          <>
            <dt>{DUEL.proof.seed}</dt>
            <dd>{match.reveal.serverSeed}</dd>
            <dt>{DUEL.proof.seeds}</dt>
            <dd>{match.reveal.clientSeeds.join(" · ")}</dd>
          </>
        ) : null}
      </dl>
    </details>
  );
}

export interface Crank {
  key: string;
  label: string;
  run: () => void;
}

export function DuelResult({ match, me, cranks, busy, onAgain }: { match: DuelMatchWire; me: string; cranks: readonly Crank[]; busy: string | null; onAgain: () => void }) {
  const seat = match.creator.toLowerCase() === me.toLowerCase() ? 0 : 1;
  const mine = seat === 0 ? match.creatorPnlBase : match.challengerPnlBase;
  const theirs = seat === 0 ? match.challengerPnlBase : match.creatorPnlBase;
  const final = match.status === "finalized";
  const verdict = !final ? DUEL.result.waiting : BigInt(mine) > BigInt(theirs) ? DUEL.result.won : BigInt(mine) < BigInt(theirs) ? DUEL.result.lost : DUEL.result.tie;
  const pickOf = (cardIndex: number, s: 0 | 1) => match.picks.find((p) => p.cardIndex === cardIndex && p.seat === s) ?? null;
  return (
    <section className="du-result" aria-label={DUEL.result.title(match.status)}>
      <ConfettiBurst fire={final && BigInt(mine) > BigInt(theirs)} />
      <div className="du-totals">
        <div className="du-total">
          <span className="du-seat-label">{DUEL.result.you}</span>
          <Odometer kind="pnl" value={toNumber(mine)} className="du-total-figure" />
        </div>
        <span className="du-vs" aria-hidden>
          {DUEL.lobby.vs}
        </span>
        <div className="du-total">
          <span className="du-seat-label">{DUEL.result.opponent}</span>
          <Odometer kind="pnl" value={toNumber(theirs)} className="du-total-figure" />
        </div>
      </div>
      <p className="du-verdict" data-final={final || undefined}>
        {verdict}
      </p>
      <ol className="du-rows">
        {match.deck.map((c, i) => {
          const a = pickOf(c.index, seat as 0 | 1);
          const b = pickOf(c.index, (seat === 0 ? 1 : 0) as 0 | 1);
          return (
            <li key={c.index} className="du-row" style={{ "--i": i } as CSSProperties}>
              <AssetDisc asset={c.asset} className="gm-disc du-deck-disc" />
              <span className="du-row-asset">{tickerOf(c.asset)}</span>
              <span className="du-row-side" data-side={a?.pick}>
                {a ? DUEL.result.side[a.pick] : DUEL.result.none}
              </span>
              <span className="du-row-side" data-side={b?.pick}>
                {b ? DUEL.result.side[b.pick] : DUEL.result.none}
              </span>
              <span className="du-row-money">{a ? `${dollars(a.costBase)} → ${a.settled ? dollars(a.payoutBase) : "…"}` : DUEL.result.none}</span>
            </li>
          );
        })}
      </ol>
      <div className="du-actions">
        {cranks.map((c) => (
          <button key={c.key} type="button" className="du-cta du-cta--sm" disabled={busy !== null} onClick={c.run}>
            {busy === c.key ? DUEL.sending : c.label}
          </button>
        ))}
        {final || match.status === "refunded" ? (
          <button type="button" className="du-ghost" onClick={onAgain}>
            {DUEL.result.again}
          </button>
        ) : null}
      </div>
      <Proof match={match} />
    </section>
  );
}
