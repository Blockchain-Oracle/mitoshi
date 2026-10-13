/**
 * Every word the swipe stage says, for both modes that use it.
 *
 * The gesture is vertical because the question is: up means the price rises, down means it falls.
 * Horizontal would have been the reference's motion and the wrong metaphor here — and on a phone it
 * fights the browser's own back-swipe.
 */
export const STAGE = {
  up: "Up",
  down: "Down",
  hint: "Swipe ↑ or ↓",
  hintHeld: "Not playable now · reason above",
  /** Flicky's `UNPLACEABLE_HINT`, for a side whose quote the arena refuses: the book cannot fill it at this stake. */
  hintLocked: (side: "up" | "down") => `${side === "up" ? "Up" : "Down"} locked · book too thin. Try ${side === "up" ? "Down" : "Up"}.`,
  /** The odds slot on a side the arena would refuse. */
  locked: "locked",
  cardOf: (n: number, total: number) => `Card ${n} of ${total}`,
  cardLabel: (asset: string, cadence: string) => `${asset}, ${cadence} Window`,
  /** The title band's pair, as the reference writes `btc / usd`. Every Window here is quoted in dollars. */
  pair: (asset: string) => (asset.endsWith("-24") ? `${asset.slice(0, -3)} / USD · 24/7` : `${asset} / USD`),
  settlesIn: (clock: string) => `settles in ${clock}`,
  settling: "settling…",
  clockPending: "–:––",
  /** Read out when a card comes up, so a screen reader hears the deck advance. */
  announce: (n: number, total: number, asset: string, cadence: string) => `Card ${n} of ${total}. ${asset}, ${cadence} Window.`,
  played: (side: "up" | "down") => (side === "up" ? "You called up" : "You called down"),
  empty: {
    title: "Nothing to play",
    body: "Every card played.",
  },
} as const;
