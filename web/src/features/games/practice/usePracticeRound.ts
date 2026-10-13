"use client";

import {
  PRACTICE_IDLE,
  PRACTICE_WATCH_SEC,
  practiceClosesAtMs,
  practiceScore,
  practiceTransition,
  nextPracticeCard,
  selectPracticeDeck,
  type DeckCard,
  type Pick,
  type PracticeCandidate,
  type PracticeRound,
  type PracticeScore,
} from "@cwf/core/games";
import { isOk } from "@cwf/core";
import type { AssetPrice } from "@cwf/core/types";
import { useLanes } from "@cwf/markets/react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { feedKeyOf } from "@/features/markets/units";
import { useNowMs } from "@/lib/clock";

/**
 * One practice round, from the venue's live Windows to the scoreboard.
 *
 * The round's state is core's reducer; everything this hook adds is the live feed and the two
 * moments that read it — the entry price at a swipe, and the card's own close 30 s after that swipe
 * (R6 games §4.2.1: every card's "30 s" is true). Both are real readings. If a reading is missing at
 * either moment the card is not scored rather than being given a made-up number, which is why
 * `practiceScore` tolerates a missing close in the first place.
 */

export type PracticeReadiness =
  | { kind: "dealing" }
  /** The venue answered and had nothing with enough life left — a schedule fact, not a fault. */
  | { kind: "no-deck" }
  | { kind: "unreadable" }
  | { kind: "ready" };

export interface PracticeSession {
  round: PracticeRound;
  readiness: PracticeReadiness;
  active: DeckCard | null;
  /** The live price per asset in the deck, as the probes report it. */
  priceOf: (asset: string) => AssetPrice | null;
  playedSide: (cardIndex: number) => Pick | null;
  /** Every asset the deck needs a feed for — one probe is mounted per entry. */
  assets: readonly string[];
  pick: (card: DeckCard, side: Pick) => void;
  deal: () => void;
  reportPrice: (price: AssetPrice) => void;
  watchLeftSec: number;
  /** When a swiped card's own race closes (its swipe + 30 s); null before its swipe. */
  closesAtMs: (cardIndex: number) => number | null;
  score: PracticeScore | null;
  nowMs: number;
}

function freshSeed(): string {
  const c = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Only reached where `crypto` is absent. The bot is a coin flip either way; this is not a security seed.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function usePracticeRound(): PracticeSession {
  const lanes = useLanes();
  const nowMs = useNowMs();
  const [round, dispatch] = useReducer(practiceTransition, PRACTICE_IDLE);
  const [prices, setPrices] = useState<ReadonlyMap<string, AssetPrice>>(new Map());
  /** Bumped by "New deck" so a fresh deal can be asked for from a round that already dealt. */
  const [dealNonce, setDealNonce] = useState(0);
  const dealtFor = useRef(-1);

  const candidates = useMemo<readonly PracticeCandidate[] | null>(() => {
    if (!lanes) return null;
    if (!isOk(lanes)) return null;
    return lanes.value.lanes.flatMap((lane) =>
      lane.markets.map((market) => ({
        marketId: market.marketId,
        // The feed the card is scored on — a 24/7 stock Window reads its `-24` feed (R4-9, D-227).
        asset: feedKeyOf(market),
        intervalSec: market.intervalSec,
        expirySec: market.expirySec,
        trading: market.status === "Trading",
      })),
    );
  }, [lanes]);

  /**
   * One deal per nonce, and only once the venue and the clock have both answered — dealing against a
   * zero clock would judge every Window's remaining life against 1970.
   *
   * The effect re-runs on every tick and every lane poll, and that is what makes it self-healing: a
   * venue with nothing dealable right now simply keeps failing the length check until a Window opens,
   * and the first deal that succeeds claims the nonce and stops.
   */
  useEffect(() => {
    if (dealtFor.current === dealNonce && round.cards.length > 0) return;
    if (!candidates || nowMs === 0) return;
    const cards = selectPracticeDeck(candidates, Math.floor(nowMs / 1_000));
    if (cards.length === 0) return;
    dealtFor.current = dealNonce;
    dispatch({ kind: "deal", seed: freshSeed(), cards });
  }, [dealNonce, candidates, nowMs, round.cards.length]);

  const deal = useCallback(() => setDealNonce((n) => n + 1), []);

  const reportPrice = useCallback((price: AssetPrice) => {
    setPrices((prior) => {
      const held = prior.get(price.asset);
      if (held && held.priceRaw === price.priceRaw && held.blockTimestampSec === price.blockTimestampSec) return prior;
      const next = new Map(prior);
      next.set(price.asset, price);
      return next;
    });
  }, []);

  const priceOf = useCallback((asset: string) => prices.get(asset) ?? null, [prices]);

  const pick = useCallback(
    (card: DeckCard, side: Pick) => {
      const price = prices.get(card.asset);
      // No reading, no entry. A swipe that cannot be priced is refused rather than dated at zero.
      if (!price) return;
      dispatch({ kind: "pick", pick: { cardIndex: card.index, side, entryRaw: price.priceRaw, decimals: price.decimals, atMs: Date.now() } });
    },
    [prices],
  );

  // Each card closes 30 s after its own swipe, on the latest price (a ref, not the closure the swipe saw). The
  // timers are keyed by card and live as long as the deal; a new deal or unmount clears them.
  const pricesRef = useRef(prices);
  pricesRef.current = prices;
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const live = timers.current;
    return () => {
      live.forEach(clearTimeout);
      live.clear();
    };
  }, [round.seed]);
  useEffect(() => {
    for (const p of round.picks) {
      if (timers.current.has(p.cardIndex) || round.closes.some((c) => c.cardIndex === p.cardIndex)) continue;
      const asset = round.cards.find((c) => c.index === p.cardIndex)?.asset;
      const id = setTimeout(() => {
        const price = asset ? pricesRef.current.get(asset) : undefined;
        if (price) dispatch({ kind: "close", close: { cardIndex: p.cardIndex, closeRaw: price.priceRaw, atMs: Date.now() } });
      }, Math.max(0, p.atMs + PRACTICE_WATCH_SEC * 1_000 - Date.now()));
      timers.current.set(p.cardIndex, id);
    }
  }, [round.picks, round.closes, round.cards]);

  // The round scores as soon as every swiped card has its close; a card whose price was missing at its close is
  // left unscored, so a safety timer a second after the watch ends scores with whatever closed.
  useEffect(() => {
    if (round.phase !== "watching" || round.watchEndsAtMs === null) return;
    if (round.picks.every((p) => round.closes.some((c) => c.cardIndex === p.cardIndex))) {
      dispatch({ kind: "score", closes: [] });
      return;
    }
    const id = setTimeout(() => dispatch({ kind: "score", closes: [] }), Math.max(0, round.watchEndsAtMs + 1_000 - Date.now()));
    return () => clearTimeout(id);
  }, [round.phase, round.watchEndsAtMs, round.picks, round.closes]);

  const closesAtMs = useCallback((cardIndex: number) => practiceClosesAtMs(round, cardIndex), [round]);

  const playedSide = useCallback((cardIndex: number) => round.picks.find((p) => p.cardIndex === cardIndex)?.side ?? null, [round.picks]);

  const assets = useMemo(() => [...new Set(round.cards.map((card) => card.asset))], [round.cards]);

  const readiness = useMemo<PracticeReadiness>(() => {
    if (round.cards.length > 0) return { kind: "ready" };
    if (lanes && !isOk(lanes)) return { kind: "unreadable" };
    if (candidates === null || nowMs === 0) return { kind: "dealing" };
    return { kind: "no-deck" };
  }, [round.cards.length, lanes, candidates, nowMs]);

  const watchLeftSec =
    round.phase === "watching" && round.watchEndsAtMs !== null && nowMs > 0
      ? Math.max(0, Math.ceil((round.watchEndsAtMs - nowMs) / 1_000))
      : PRACTICE_WATCH_SEC;

  return {
    round,
    readiness,
    active: nextPracticeCard(round),
    priceOf,
    playedSide,
    assets,
    pick,
    deal,
    reportPrice,
    watchLeftSec,
    closesAtMs,
    score: round.phase === "scored" ? practiceScore(round) : null,
    nowMs,
  };
}
