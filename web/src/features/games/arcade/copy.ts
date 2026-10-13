import type { ArcadeGame } from "@cwf/core/games/arcade";

/**
 * Everything the arcade says.
 *
 * The one line that must survive every screen is the honesty line: an arcade score is checked by
 * replaying the run on the server, it is not on chain, and no money ever rides on it. The pitches are
 * Pips's, in our words; the control hints say what this build actually listens to.
 */
export const ARCADE = {
  /** The board's label (copy cut #15): what a score here is and is not. */
  honesty: "Server-checked · no stake",
  signIn: "to rank your runs",

  games: {
    "line-rider": {
      title: "Line Rider",
      line: "Sled the real chart",
      control: "Hold to press · let go to hop · lean ← →",
    },
    "candle-hop": {
      title: "Candle Hop",
      line: "Hop the real chart's gaps",
      control: "Tap or Space to hop",
    },
  } satisfies Record<ArcadeGame, { title: string; line: string; control: string }>,

  /** The full-screen stage (R4-9, D-227; Senryo StageParts). */
  stage: {
    go: "GO",
    grip: "Charge",
    earned: "Your best on the board",
    earnedOn: (d: Date) => `Earned ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    sound: "Sound on",
    mute: "Mute",
    pause: "Pause",
    paused: "Paused",
    resume: "Resume",
    exit: "Exit",
    share: "Share",
    length: "Length",
    seed: "Seed",
    shareText: (score: string, title: string) => `I scored ${score} on ${title} at Mitoshi. Beat it:`,
    /** The tape's provenance under the run: whose prints and when (engine v2). */
    tapeOf: (feed: string, fromSec: number, toSec: number) => {
      const t = (s: number) => new Date(s * 1_000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      return `${feed} prints ${t(fromSec)}–${t(toSec)}`;
    },
  },

  hud: {
    score: "Score",
    best: "Best",
    combo: (mult: number) => `×${Number.isInteger(mult) ? mult : mult.toFixed(1)}`,
  },

  title: {
    play: "Play",
    best: (score: string) => `Best ${score}`,
    noBest: "No run yet",
  },

  over: {
    newBest: "NEW BEST",
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
      signedOut: "Sign in to rank your runs",
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
    unreachable: "Board offline · play on",
    noStore: "No board yet. Your best stays on this device.",
    unavailable: "No board yet. Your best stays on this device.",
    yours: (score: string, rank: number | null) => (rank === null ? `Your best ${score}` : `Your best ${score} · #${rank}`),
    connect: "Sign in to rank",
  },

  calm: {
    label: "Calmer ramp",
    hint: "Slower ramp · marked",
  },

  fmt: (n: number) => Math.round(n).toLocaleString("en-US"),
} as const;
