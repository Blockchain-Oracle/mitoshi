"use client";

// /games/duel — the versus (R4-9, D-227). Ported from Owarine 90a91d71:web/src/features/games/duel/DuelStage.tsx and
// Masayume 68f7a09's arena flow, on Mitoshi's GameArena (contracts/src/products/arena, live on Moderato): find a duel at
// a pot → paired with the longest-waiting wallet at that pot and dealt a sealed deck of live 15m and 1h Windows → the
// creator opens the match (its pot in, the deck's commitment on chain), the challenger joins (its pot in) → either
// browser opens the deck (permissionless; the material is released only once both pots are in) → each seat swipes every
// card, one real IOC per card at the tier's $1 cap, measured by the arena → the cards settle on their Windows' closes
// and the better P&L takes both pots. Every crank (lock, settle, award, claim) is anyone's to send, and is offered here.
// Signed out, the CTA opens sign-in for that duel (the CTA is the action).
import { isOk, type Bytes32 } from "@cwf/core";
import { cardsInMask, PICK_ATTEMPT_GUARD_SEC, PICK_ATTEMPT_MAX, pickFloorRaw, type DeckCard, type Pick, type StakeTierId } from "@cwf/core/games";
import { quoteArenaPick } from "@cwf/markets/arena";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNowMs } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { playSfx, startBgm, stopBgm } from "../audio";
import { useGames, useImmersive } from "../GamesProvider";
import { tickerOf } from "../lanes";
import { CardLine } from "../practice/BeatParts";
import { StageFace } from "../stage/StageFace";
import { SwipeDeck, type DeckPlace } from "../stage/SwipeDeck";
import { DUEL } from "./copy";
import { DeckRow, DuelEntry, DuelQueue, DuelResult, dollars, Proof, Versus, type Crank } from "./DuelParts";
import type { DuelMatchWire, DuelPairedWire } from "./duel-wire";
import { useDuelMatch, useDuelQueue, useDuelWrite } from "./useDuel";
import "./duel.css";

const PRE_PICK = new Set(["pending", "waiting", "activeUnrevealed"]);
/** How often a waiting player asks to be paired again when no next deck was projected. */
const RETRY_MS = 15_000;

/** The cranks anyone may send for a match right now, in the order the arena accepts them. */
export function cranksFor(m: DuelMatchWire, address: string | null, nowMs: number, write: ReturnType<typeof useDuelWrite>["write"]): Crank[] {
  const out: Crank[] = [];
  const id = m.matchId as Bytes32;
  if (m.status === "picking" && m.pickDeadlineSec !== null && Math.floor(nowMs / 1_000) > m.pickDeadlineSec) out.push({ key: "lock", label: DUEL.result.lock, run: () => void write("lock", { kind: "arena-lock", matchId: id }) });
  for (const i of m.decided) out.push({ key: `settle:${i}`, label: DUEL.result.settle(i + 1), run: () => void write(`settle:${i}`, { kind: "arena-settle-card", matchId: id, cardIndex: i }) });
  const played = m.picks.reduce((mask, p) => mask | (1 << p.cardIndex), 0);
  if ((m.status === "settling" || m.status === "forfeited") && cardsInMask(played & ~m.settledMask, m.deck.length).length === 0) out.push({ key: "finalize", label: DUEL.result.finalize, run: () => void write("finalize", { kind: "arena-finalize", matchId: id }) });
  if (address && BigInt(m.creditBase) > 0n) out.push({ key: "claim", label: DUEL.result.claim(dollars(m.creditBase)), run: () => void write("claim", { kind: "arena-claim", player: address as `0x${string}` }) });
  return out;
}

/** A paired duel the creator never opened is let go after this (the server drops the pair at 120 s), and the challenger may find another. */
const UNOPENED_SEC = 125;

function Lobby({ paired, match, me, write, busy, failed, onRequeue }: { paired: DuelPairedWire; match: DuelMatchWire | null; me: string; write: ReturnType<typeof useDuelWrite>["write"]; busy: string | null; failed: string | null; onRequeue: () => void }) {
  const status = match?.status ?? "pending";
  const nowMs = useNowMs();
  const unopened = status === "pending" && match !== null && nowMs > 0 && Math.floor(nowMs / 1_000) - match.createdAtSec > UNOPENED_SEC;
  const opponent = paired.role === "creator" ? paired.challenger : paired.creator;
  const pot = paired.potBase === "0" ? DUEL.entry.tierWord("free", 0) : dollars(paired.potBase);
  const autoRevealed = useRef(false);

  const open = () =>
    void write("open", { kind: "arena-create", matchId: paired.matchId, challenger: paired.challenger, tier: paired.tierIndex, deckHash: paired.deckHash, deckSize: paired.deckSize, policyVersion: paired.policyVersion, potBase: BigInt(paired.potBase) });
  const join = () => void write("join", { kind: "arena-join", matchId: paired.matchId, potBase: BigInt(paired.potBase) });
  const reveal = useCallback(() => {
    if (!match?.reveal) return;
    void write("reveal", { kind: "arena-reveal", matchId: paired.matchId, serverSeed: match.reveal.serverSeed, clientSeeds: match.reveal.clientSeeds, cards: match.reveal.cards });
  }, [match?.reveal, paired.matchId, write]);

  // The creator opens the deck as soon as both pots are in; the challenger keeps the button in case it doesn't.
  useEffect(() => {
    if (status !== "activeUnrevealed" || paired.role !== "creator" || autoRevealed.current || !match?.reveal) return;
    autoRevealed.current = true;
    reveal();
  }, [status, paired.role, match?.reveal, reveal]);

  let action: { label: string; run: () => void; key: string } | null = null;
  let line: string | null = null;
  if (status === "pending") {
    if (paired.role === "creator") action = { key: "open", label: DUEL.lobby.open(pot), run: open };
    else line = DUEL.lobby.waitOpen;
  } else if (status === "waiting") {
    if (paired.role === "challenger") action = { key: "join", label: DUEL.lobby.join(pot), run: join };
    else line = DUEL.lobby.waitJoin;
  } else if (status === "activeUnrevealed") {
    action = { key: "reveal", label: busy === "reveal" ? DUEL.lobby.revealing : DUEL.lobby.reveal, run: reveal };
  }

  return (
    <section className="du-lobby" aria-label={DUEL.title}>
      <Versus me={me} opponent={opponent} />
      {match ? <DeckRow match={match} size={paired.deckSize} /> : null}
      {action ? (
        <button type="button" className="du-cta" disabled={busy !== null} onClick={action.run} data-primary-action>
          {busy === action.key ? DUEL.sending : action.label}
        </button>
      ) : (
        <p className="du-note" aria-live="polite">
          {line}
        </p>
      )}
      {failed ? <p className="du-fail">{DUEL.failed(failed)}</p> : null}
      {unopened ? (
        <button type="button" className="du-ghost" onClick={onRequeue}>
          {DUEL.lobby.another}
        </button>
      ) : null}
      {match ? <Proof match={match} /> : null}
    </section>
  );
}

function Picking({ match, me, write, busy, failed }: { match: DuelMatchWire; me: string; write: ReturnType<typeof useDuelWrite>["write"]; busy: string | null; failed: string | null }) {
  const nowMs = useNowMs();
  const sending = useRef(false);
  const [hold, setHold] = useState(false);
  const seat = match.creator.toLowerCase() === me.toLowerCase() ? 0 : 1;
  const mine = useMemo(() => new Map(match.picks.filter((p) => p.seat === seat).map((p) => [p.cardIndex, p.pick as Pick])), [match.picks, seat]);
  const theirs = useMemo(() => new Set(match.picks.filter((p) => p.seat !== seat).map((p) => p.cardIndex)), [match.picks, seat]);
  const active = match.deck.find((c) => !mine.has(c.index)) ?? null;
  const leftSec = match.pickDeadlineSec ? Math.max(0, match.pickDeadlineSec - Math.floor(nowMs / 1_000)) : null;

  // Masayume's pick ladder (core picking.ts): quote the stake on the live book, place with a floor under that size, and
  // when two seats drew the same liquidity in the same second and the fill came back under it, quote again with a
  // looser floor — 90 %, 70 %, then 50 % — up to four sends, never past the deadline's guard. The stake never grows.
  const onPick = async (card: DeckCard, side: Pick) => {
    if (sending.current) return;
    sending.current = true;
    setHold(true);
    try {
      await pickWithLadder(card, side);
    } finally {
      sending.current = false;
      setHold(false);
    }
  };
  const pickWithLadder = async (card: DeckCard, side: Pick) => {
    const stakeBase = BigInt(match.perCardCapBase);
    playSfx(side === "up" ? "swipe-up" : "swipe-down");
    for (let attempt = 1; attempt <= PICK_ATTEMPT_MAX; attempt += 1) {
      if (match.pickDeadlineSec !== null && Date.now() / 1_000 > match.pickDeadlineSec - PICK_ATTEMPT_GUARD_SEC) return;
      const q = await quoteArenaPick(card.marketId, side, stakeBase);
      const floor = isOk(q) && q.value ? pickFloorRaw(q.value.quantityRaw, attempt) : 0n;
      const last = attempt === PICK_ATTEMPT_MAX;
      const r = await write(`pick:${card.index}`, { kind: "arena-pick", matchId: match.matchId as Bytes32, cardIndex: card.index, pick: side, stakeBase, minQuantityRaw: floor }, { quietKinds: last ? [] : ["below-min-quantity"] });
      if (r.ok || r.kind !== "below-min-quantity") return;
    }
  };

  const renderFace = (card: DeckCard, place: DeckPlace) => (
    <StageFace
      card={card}
      place={place}
      nowMs={nowMs || undefined}
      eyebrow={DUEL.pick.eyebrow(tickerOf(card.asset))}
      question={DUEL.pick.question}
      line={<CardLine asset={card.asset} nowMs={nowMs} entryE8={null} />}
      pills={[
        { label: DUEL.pick.stake, value: dollars(match.perCardCapBase), tone: "live" },
        { label: DUEL.lobby.opponent, value: theirs.has(card.index) ? DUEL.pick.yours : DUEL.result.none },
      ]}
    />
  );

  if (!active) return <p className="du-note du-note--wait">{DUEL.pick.waitOpponent}</p>;
  return (
    <>
      <SwipeDeck cards={match.deck} active={active} playedSide={(i) => mine.get(i) ?? null} onPick={(card, side) => void onPick(card, side)} busy={busy !== null || hold} refusal={failed ? DUEL.failed(failed) : null} renderFace={renderFace} />
      {leftSec !== null ? <p className="du-note">{DUEL.pick.left(leftSec)}</p> : null}
    </>
  );
}

export function DuelStage() {
  const { address, connectFor } = useWalletSession();
  const { feedback } = useGames();
  const { queue, find, leave, error } = useDuelQueue(address);
  const paired = queue?.status === "paired" ? queue : null;
  const match = useDuelMatch(paired?.matchId ?? null);
  const { write, busy, failed } = useDuelWrite(paired?.matchId ?? null);
  const [tier, setTier] = useState<StakeTierId>("free");
  const [finding, setFinding] = useState(false);
  const nowMs = useNowMs();
  const m = match.data ?? null;
  // While waiting, stay in line and ask again — at the next deck the server projected, else every 15 s — so two
  // players who both arrived before a deck existed are paired the moment one can be dealt. The projection is kept as a
  // moment (the queue's plain polls don't carry it), so the countdown runs between asks.
  const waitingTier = queue?.status === "waiting" ? queue.tier : null;
  const queuedAt = queue?.status === "waiting" ? queue.queuedAt : null;
  const projected = queue?.status === "waiting" ? queue.nextDealSec : null;
  const [dealAtMs, setDealAtMs] = useState<number | null>(null);
  useEffect(() => {
    if (!waitingTier) setDealAtMs(null);
    else if (projected !== null) setDealAtMs(Date.now() + projected * 1_000);
  }, [waitingTier, projected, queuedAt]);
  useEffect(() => {
    if (!waitingTier) return;
    const id = window.setTimeout(() => void find(waitingTier), dealAtMs !== null ? Math.max(2_000, dealAtMs - Date.now()) : RETRY_MS);
    return () => window.clearTimeout(id);
  }, [waitingTier, dealAtMs, queuedAt, find]);
  useImmersive(m?.status === "picking");
  useEffect(() => () => stopBgm(), []);
  // The match chord when the queue pairs you; the duel's own sting when the pot is decided.
  const pairedId = paired?.matchId ?? null;
  useEffect(() => {
    if (pairedId) playSfx("match-found");
  }, [pairedId]);
  const finalSeen = useRef<string | null>(null);
  useEffect(() => {
    if (!m || m.status !== "finalized" || !address || finalSeen.current === m.matchId) return;
    finalSeen.current = m.matchId;
    const seat = m.creator.toLowerCase() === address.toLowerCase() ? 0 : 1;
    const mine = BigInt(seat === 0 ? m.creatorPnlBase : m.challengerPnlBase);
    const theirs = BigInt(seat === 0 ? m.challengerPnlBase : m.creatorPnlBase);
    playSfx(mine >= theirs ? "duel-win" : "duel-lose");
  }, [m, address]);

  const onFind = async () => {
    if (!address) return connectFor(DUEL.entry.signIn);
    feedback("tap");
    startBgm();
    setFinding(true);
    await find(tier);
    setFinding(false);
  };

  const cranks = m && paired ? cranksFor(m, address, nowMs, write) : [];

  return (
    <div className="gm-page du-stage">
      {!paired ? (
        queue?.status === "waiting" ? (
          <DuelQueue queue={queue} me={address ?? ""} nextDealSec={dealAtMs !== null && nowMs > 0 ? Math.max(0, Math.round((dealAtMs - nowMs) / 1_000)) : null} onLeave={() => void leave()} />
        ) : (
          <DuelEntry tier={tier} onTier={setTier} onFind={() => void onFind()} busy={finding} error={error} />
        )
      ) : !address ? null : PRE_PICK.has(m?.status ?? "pending") ? (
        <Lobby paired={paired} match={m} me={address} write={write} busy={busy} failed={failed} onRequeue={() => void find(paired.tier)} />
      ) : m && m.status === "picking" && m.picks.filter((p) => p.seat === (m.creator.toLowerCase() === address.toLowerCase() ? 0 : 1)).length < m.deck.length ? (
        <Picking match={m} me={address} write={write} busy={busy} failed={failed} />
      ) : m ? (
        <DuelResult match={m} me={address} cranks={cranks} busy={busy} onAgain={() => void find(tier)} />
      ) : null}
      {match.isError ? <p className="du-fail">{DUEL.offline}</p> : null}
    </div>
  );
}
