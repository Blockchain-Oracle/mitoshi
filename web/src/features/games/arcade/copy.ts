import type { ArcadeGame } from "@cwf/core/games/arcade";

/**
 * Everything the arcade says.
 *
 * The one line that must survive every screen is the honesty line: an arcade score is checked by
 * replaying the run on the server, it is not on chain, and no money ever rides on it. The pitches are
 * Pips's, in our words; the control hints say what this build actually listens to.
 */
export const ARCADE = {
  eyebrow: "Arcade · no stake · not on the ledger",
  /** The board's label, verbatim from doc 06: what a score here is and is not. */
  honesty: "arcade score · server-checked · not on the ledger",

  games: {
    "line-rider": {
      title: "Line Rider",
      pitch: "Keep the dot on the line. The longer you ride it, the faster the score climbs; drift off and your grip drains. Grip empty, run over.",
      control: "Drag on the screen, scroll, or hold ↑ ↓ to move the dot",
      readout: "Follow the line",
    },
    "candle-hop": {
      title: "Candle Hop",
      pitch: "Tap to lift, let it fall, and slip through the candle gaps. Each gap is a point; one clipped candle ends the run.",
      control: "Tap the screen or press Space to hop",
      readout: "Hop the gaps",
    },
  } satisfies Record<ArcadeGame, { title: string; pitch: string; control: string; readout: string }>,

  hud: {
    score: "Score",
    best: "Best",
    combo: (mult: number) => `×${mult.toFixed(1)}`,
  },

  title: {
    play: "Play",
    best: (score: string) => `Best ${score}`,
    noBest: "No run yet",
  },

  over: {
    newBest: "★ New best",
    ranked: (rank: number) => (rank <= 10 ? `Ranked #${rank}` : `Rank #${rank}`),
    over: "Run over",
    topOfBoard: "Top of the board",
    onBoard: "On the board",
    keepClimbing: "Keep climbing",
    checking: "Checking the run…",
    /** The server said no: its own words, and the score stays on screen as a number nobody recorded. */
    refused: (why: string) => `Not recorded — ${why}`,
    /** Why a run stayed local, by the reason the stage already knew before it started. */
    local: {
      signedOut: "Sign in to post to the board",
      noStore: "Kept on this device",
      unavailable: "Kept on this device",
    },
    again: "Play again",
    seed: (seed: string) => `seed ${seed}`,
    length: (sec: string) => `${sec}s`,
  },

  board: {
    title: "Top runs",
    empty: "No scores yet. Set the first.",
    you: "you",
    calm: "calm",
    loading: "Reading the board…",
    unreachable: "The board did not answer. Play goes on; the score stays on this screen.",
    noStore: "No board yet. Your best stays on this device.",
    unavailable: "No board yet. Your best stays on this device.",
    yours: (score: string, rank: number | null) => (rank === null ? `Your best ${score}` : `Your best ${score} · #${rank}`),
    connect: "Take a seat to post — play is open without one.",
  },

  calm: {
    label: "Calmer ramp",
    hint: "A slower climb to full speed. Scores set on it are marked on the board.",
  },

  note: {
    label: "What this is",
    body: "A seeded run. The line and the candles come from a seed you can see, your inputs are recorded, and the server replays the run before it records a score. Nothing here is a position, a payout or a rating.",
  },

  fmt: (n: number) => Math.round(n).toLocaleString("en-US"),
} as const;
