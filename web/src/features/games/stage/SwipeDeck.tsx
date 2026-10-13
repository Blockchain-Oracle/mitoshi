"use client";

import type { DeckCard, Pick } from "@cwf/core/games";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useTransform, type PanInfo } from "motion/react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useGames } from "../GamesProvider";
import { CardBack } from "../art/PixelArt";
import { DRAG_MAX_ROTATE_DEG, FLY_ROTATE_DEG, SETTLE, STAMP_AT_PX, THROW } from "../motion";
import { STAGE } from "./copy";
import "./stage.css";

/**
 * The deck as a gesture: one card at a time, thrown up for UP and down for DOWN.
 *
 * Three things about the shape are deliberate.
 *
 * **The face is a slot.** This component knows a card's identity and nothing about money, so
 * Practice and the Duel are the same motion over different faces — which is the point of building
 * Practice first (`06-game-architecture.md` §Owner decisions 1: the two ship together because they
 * share the swipe loop).
 *
 * **The buttons are not a fallback.** Doc 04 requires a keyboard and pointer alternative to every
 * swipe, so the two calls are always rendered and always sufficient; the drag is the flourish on
 * top. That is also why turning motion off removes the drag and loses nothing. They are drawn as the
 * reference's fifth band — the YES/NO chips with a side's odds on each (`swipe-screen.tsx` L407–451).
 *
 * **A refusal is not a failure.** `refusal` is for a card the chain would not take right now — the
 * arena's own entry gate — and it holds the card in place with its reason rather than letting a
 * player throw it at a transaction that would revert. A locked side is the same idea for one side of
 * one card: the book cannot fill that side at this stake, so the throw springs back with the reason.
 */

/** One side's live odds: the venue's own ask at the stake, as a whole percent; locked when the arena would refuse it. */
export interface SideOdds {
  pct: number | null;
  locked: boolean;
}

export interface DeckOdds {
  up: SideOdds;
  down: SideOdds;
}

/** Where the active card sits in its deck, handed to the face for its title band. */
export interface DeckPlace {
  position: number;
  total: number;
}

export interface SwipeDeckProps {
  cards: readonly DeckCard[];
  /** The card awaiting a swipe; null when the deck is played out or the mode has taken the gesture away. */
  active: DeckCard | null;
  /** Which way a card was already played, for the progress strip. Null for one not yet played. */
  playedSide: (cardIndex: number) => Pick | null;
  onPick: (card: DeckCard, side: Pick) => void;
  /** A pick is in flight. The card stays put and the calls go quiet rather than the stage jumping. */
  busy?: boolean;
  /** Why this card cannot be played right now, in the player's words. Null when it can. */
  refusal?: string | null;
  /** The active card's per-side odds. Null (or a null pct) draws the calls without a figure. */
  odds?: DeckOdds | null;
  renderFace: (card: DeckCard, place: DeckPlace) => ReactNode;
  /** `none` when the mode draws its own deck strip (Practice, R6 games §4.2.3); the position is still announced. */
  strip?: "pips" | "none";
  /** Rendered under the calls in place of the default hint — the mode's own sentence, when it has one. */
  hint?: ReactNode;
}

/** Past this many pixels of travel, or this fast, the throw counts. Below both, the card springs back. */
const COMMIT_TRAVEL = 84;
const COMMIT_VELOCITY = 480;
/** Far enough to clear the tallest card at any width; the stack is clipped by the page, not by this. */
const THROW_DISTANCE = 420;
/** The card's height before the deck has measured itself — only the tilt's scale depends on it. */
const FALLBACK_HEIGHT = 420;
/** How long the locked-side reason stays under the calls after a refused throw. */
const LOCKED_HINT_MS = 4_000;

/**
 * Flicky's throw: the card leaves opaque, spinning off past the tilt it was dragged to
 * (`swipe-screen.tsx` L178–186), rather than fading. Our axis is vertical, so the spin follows it.
 */
const FULL = {
  enter: { opacity: 0, scale: 0.96, y: 12 },
  in: { opacity: 1, scale: 1, y: 0, rotate: 0 },
  out: (side: Pick | null) => ({
    opacity: 1,
    y: side === "up" ? -THROW_DISTANCE : side === "down" ? THROW_DISTANCE : 0,
    rotate: side === "up" ? -FLY_ROTATE_DEG : side === "down" ? FLY_ROTATE_DEG : 0,
    transition: THROW,
  }),
};

/** Reduced motion keeps every state change and drops the movement — the card swaps, it does not fly. */
const REDUCED = {
  enter: { opacity: 1 },
  in: { opacity: 1 },
  out: { opacity: 0, transition: { duration: 0.01 } },
};

function cadenceLabel(intervalSec: number): string {
  if (intervalSec % 3_600 === 0) return `${intervalSec / 3_600}h`;
  if (intervalSec % 60 === 0) return `${intervalSec / 60}m`;
  return `${intervalSec}s`;
}

const NO_ODDS: SideOdds = { pct: null, locked: false };

export function SwipeDeck({ cards, active, playedSide, onPick, busy = false, refusal = null, odds = null, renderFace, hint, strip = "pips" }: SwipeDeckProps) {
  const { reducedMotion, feedback } = useGames();
  const [thrown, setThrown] = useState<Pick | null>(null);
  const [lockedHint, setLockedHint] = useState<Pick | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  /** Set only when the card itself had focus when it was played — see the focus effect below. */
  const refocus = useRef(false);

  const held = busy || refusal !== null;
  const draggable = active !== null && !held && !reducedMotion;
  const sideOdds = { up: odds?.up ?? NO_ODDS, down: odds?.down ?? NO_ODDS };

  /**
   * Flicky's drag carries five signals at once (`swipe-screen.tsx` L159–297): the card tilts with the
   * travel, a tint rises on the side being chosen, a stamp appears past a little travel, the face
   * reacts, and the next card comes forward behind it. All of them derive from one motion value so
   * they move on the compositor with the finger; only the stamp, which mounts and unmounts, is state.
   */
  const y = useMotionValue(0);
  const rotate = useTransform(y, (v) => {
    const half = (deckRef.current?.offsetHeight || FALLBACK_HEIGHT) / 2;
    return Math.max(-DRAG_MAX_ROTATE_DEG, Math.min(DRAG_MAX_ROTATE_DEG, -(v / half) * DRAG_MAX_ROTATE_DEG));
  });
  const progress = useTransform(y, (v) => Math.min(1, Math.abs(v) / COMMIT_TRAVEL));
  const upTint = useTransform(y, (v) => (v < 0 ? Math.min(1, -v / COMMIT_TRAVEL) : 0));
  const downTint = useTransform(y, (v) => (v > 0 ? Math.min(1, v / COMMIT_TRAVEL) : 0));
  const nextY = useTransform(progress, (p) => 10 * (1 - p));
  const nextScale = useTransform(progress, (p) => 0.965 + 0.035 * p);
  const [leaning, setLeaning] = useState<Pick | null>(null);
  useMotionValueEvent(y, "change", (v) => setLeaning(v < -STAMP_AT_PX ? "up" : v > STAMP_AT_PX ? "down" : null));

  // The locked reason clears on its own, and with the card: a new card has its own sides.
  useEffect(() => {
    if (!lockedHint) return;
    const timer = setTimeout(() => setLockedHint(null), LOCKED_HINT_MS);
    return () => clearTimeout(timer);
  }, [lockedHint]);
  useEffect(() => setLockedHint(null), [active]);

  const commit = useCallback(
    (side: Pick) => {
      if (!active || held) {
        feedback("deny");
        return;
      }
      // Flicky refuses the long-shot side before the chain can (`swipe-screen.tsx` L121–130): the card
      // springs back and says why, instead of flying off into a revert.
      if (sideOdds[side].locked) {
        feedback("deny");
        setLockedHint(side);
        return;
      }
      // Flicky's swipe sound, the instant the commit is accepted and before any transaction.
      feedback(side === "up" ? "swipe-up" : "swipe-down");
      // Whether to hand focus onward is decided HERE, while the played card still holds it. The
      // calls live outside `.st-deck`, so "focus is inside the deck" means "the card had it".
      refocus.current = document.activeElement !== null && deckRef.current?.contains(document.activeElement) === true;
      setThrown(side);
      onPick(active, side);
    },
    [active, held, onPick, feedback, sideOdds.up.locked, sideOdds.down.locked],
  );

  const onDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      const up = info.offset.y <= -COMMIT_TRAVEL || info.velocity.y <= -COMMIT_VELOCITY;
      const down = info.offset.y >= COMMIT_TRAVEL || info.velocity.y >= COMMIT_VELOCITY;
      // Both true means a fast flick that ended back near the origin — the travel decides.
      if (up && !down) commit("up");
      else if (down && !up) commit("down");
    },
    [commit],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        commit("up");
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        commit("down");
      }
    },
    [commit],
  );

  /**
   * A card played from the keyboard hands focus to the next one.
   *
   * Without this the deck is unplayable by keyboard past the first card: the played card unmounts,
   * focus falls back to the body, and the player has to tab all the way in again every time. The
   * guard matters as much as the effect — focus only moves when the card that left had it, so a
   * click on a call button leaves focus on that button, where the player put it.
   *
   * The incoming card is found by its index rather than held in a ref, and that is the whole point:
   * while a throw is in the air BOTH cards are mounted, so a single ref is written by whichever
   * mounts last and cleared by whichever unmounts last. Focusing through it landed on the card on
   * its way out, which then unmounted and dropped focus to the body — the exact bug this fixes.
   */
  useEffect(() => {
    if (!refocus.current || !active) return;
    refocus.current = false;
    deckRef.current?.querySelector<HTMLElement>(`[data-card="${active.index}"]`)?.focus();
  }, [active]);

  const position = active ? cards.findIndex((card) => card.index === active.index) : cards.length;
  const behind = active ? cards.slice(position + 1, position + 3) : [];
  const place: DeckPlace = { position: Math.min(position + 1, cards.length), total: cards.length };

  return (
    <div className="st-stage">
      {strip === "pips" ? (
        <div className="st-progress">
          <div className="st-pips" aria-hidden>
            {cards.map((card) => {
              const side = playedSide(card.index);
              const state = side ? `st-pip--${side}` : card.index === active?.index ? "st-pip--active" : "";
              return <span key={card.index} className={`st-pip ${state}`} />;
            })}
          </div>
          <span className="st-progress-label">{STAGE.cardOf(place.position, place.total)}</span>
        </div>
      ) : (
        <p className="sr-only">{STAGE.cardOf(place.position, place.total)}</p>
      )}

      <div className="st-deck" ref={deckRef}>
        {behind.map((card, depth) =>
          depth === 0 ? (
            // The next card rises and grows toward full size as the top one is dragged away, following the finger.
            <motion.div key={card.index} className="st-card st-card--behind st-card--back" style={{ "--st-depth": 1, y: nextY, scale: nextScale } as never} aria-hidden>
              <CardBack className="st-back-art" />
            </motion.div>
          ) : (
            <div key={card.index} className="st-card st-card--behind st-card--back" style={{ "--st-depth": depth + 1 } as CSSProperties} aria-hidden>
              <CardBack className="st-back-art" />
            </div>
          ),
        )}

        <AnimatePresence initial={false} custom={thrown} mode="popLayout">
          {active ? (
            <motion.div
              key={active.index}
              data-card={active.index}
              className={`st-card st-card--active${held ? " st-card--held" : ""}`}
              data-swipe={leaning ?? "idle"}
              style={reducedMotion ? undefined : { y, rotate }}
              variants={reducedMotion ? REDUCED : FULL}
              custom={thrown}
              initial="enter"
              animate="in"
              exit="out"
              transition={SETTLE}
              drag={draggable ? "y" : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.7}
              dragSnapToOrigin
              onDragEnd={onDragEnd}
              tabIndex={0}
              role="group"
              aria-label={STAGE.cardLabel(active.asset, cadenceLabel(active.intervalSec))}
              onKeyDown={onKeyDown}
            >
              {renderFace(active, place)}
              {!reducedMotion && (
                <>
                  <motion.span className="st-tint st-tint--up" style={{ opacity: upTint }} aria-hidden />
                  <motion.span className="st-tint st-tint--down" style={{ opacity: downTint }} aria-hidden />
                </>
              )}
              {leaning && (
                <span className={`st-stamp st-stamp--${leaning}`} aria-hidden>
                  {leaning === "up" ? STAGE.up : STAGE.down}
                </span>
              )}
            </motion.div>
          ) : (
            <div className="st-empty" key="empty">
              <p className="st-empty-title">{STAGE.empty.title}</p>
              <p className="st-empty-body">{STAGE.empty.body}</p>
            </div>
          )}
        </AnimatePresence>
      </div>

      <span className="sr-only" aria-live="polite">
        {active ? STAGE.announce(place.position, place.total, active.asset, cadenceLabel(active.intervalSec)) : ""}
      </span>

      {refusal && <p className="st-refusal">{refusal}</p>}

      {/* The fifth band: the reference's YES/NO chips, each carrying its side's odds, dimmed and locked when the arena would refuse that side. */}
      <div className="st-actions">
        <Call side="up" odds={sideOdds.up} disabled={!active || held} onClick={() => commit("up")} />
        <Call side="down" odds={sideOdds.down} disabled={!active || held} onClick={() => commit("down")} />
      </div>

      {lockedHint ? <p className="st-hint st-hint--locked">{STAGE.hintLocked(lockedHint)}</p> : (hint ?? <p className="st-hint">{held && refusal ? STAGE.hintHeld : STAGE.hint}</p>)}
    </div>
  );
}

function Call({ side, odds, disabled, onClick }: { side: Pick; odds: SideOdds; disabled: boolean; onClick: () => void }) {
  const Arrow = side === "up" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      className={`st-call st-call--${side}`}
      data-locked={odds.locked || undefined}
      // A locked side stays pressable: the press is how a player learns why, in words, rather than a control that ignores them.
      disabled={disabled}
      aria-disabled={odds.locked || undefined}
      title={odds.locked ? STAGE.hintLocked(side) : undefined}
      onClick={onClick}
    >
      <Arrow aria-hidden />
      <span className="st-call-word">{side === "up" ? STAGE.up : STAGE.down}</span>
      {(odds.pct !== null || odds.locked) && <span className="st-call-odds">{odds.locked ? STAGE.locked : `${odds.pct}%`}</span>}
    </button>
  );
}

export { cadenceLabel };
