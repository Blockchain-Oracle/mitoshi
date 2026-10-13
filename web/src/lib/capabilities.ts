/**
 * Every nav route is registered from day one (plan S1 1b): a route whose capability is not connected yet renders
 * `CapabilityPending` with what it will do and what it waits on — never invented numbers, never a dead link. Each
 * stage replaces its entry's page with the real surface.
 */
export interface PendingCapability {
  eyebrow: string;
  title: string;
  body: string;
  /** The concrete thing the surface waits on — a contract, service or data source — and the stage that brings it. */
  dependency: string;
  /** Contextual children this page is the entry to (they are reached from here, not from the nav). */
  links?: readonly { href: string; label: string }[];
}

const engine = "the market engine on Tempo";

export const PENDING: Readonly<Record<string, PendingCapability>> = {
  "/markets": { eyebrow: "Markets", title: "Call where a price closes", body: "Live Windows on BTC, ETH, SOL and US stocks.", dependency: engine },
  "/markets/[id]": { eyebrow: "Markets", title: "This Window", body: "One Window, its book and your position.", dependency: engine },
  "/portfolio": { eyebrow: "Portfolio", title: "Your positions, money and verdicts", body: "Your money, open calls and verdicts.", dependency: engine },
  "/bridge": { eyebrow: "Bridge", title: "Move stock tokens to Tempo", body: "Stock tokens from Robinhood Chain to Tempo.", dependency: "the bridge adapters and lockboxes" },
  "/reserves": { eyebrow: "Reserves", title: "Every bridged token, backed", body: "Locked there versus supply here, per ticker.", dependency: "the bridge adapters and lockboxes" },
  "/earn": { eyebrow: "Earn", title: "Back the market makers", body: "Supply the maker vault; see results per Window.", dependency: "the maker vault" },
  "/parlay": { eyebrow: "Parlay", title: "Combine calls", body: "Several Windows on one ticket.", dependency: "the parlay reserve" },
  "/surface": { eyebrow: "Market Surface", title: "Market Surface", body: "Every Window's book at a glance.", dependency: "the parlay and range products" },
  "/games": { eyebrow: "Games", title: "Play the markets", body: "Duels, Lucky, Range, Moonshot and arcade runs.", dependency: `${engine} and the games` },
  "/games/practice": { eyebrow: "Games", title: "Practice", body: "The swipe loop, no stake.", dependency: "the games" },
  "/games/duel": { eyebrow: "Games", title: "Duel", body: "Face another player over a live deck.", dependency: "the arena" },
  "/games/duel/[matchId]": { eyebrow: "Games", title: "A duel", body: "Your picks and the settlement.", dependency: "the arena" },
  "/games/history": { eyebrow: "Games", title: "Your games", body: "Every duel and run you played.", dependency: "the arena" },
  "/games/rank": { eyebrow: "Games", title: "Season ranks", body: "This season's standings.", dependency: "the arena" },
  "/games/lucky": { eyebrow: "Games", title: "Lucky", body: "Let the reel pick a live call.", dependency: "the games" },
  "/games/range": { eyebrow: "Games", title: "Range", body: "Pick the band where price finishes.", dependency: "the range reserve" },
  "/games/moonshot": { eyebrow: "Games", title: "Moonshot", body: "Aim for a distant target.", dependency: "the range reserve" },
  "/games/line-rider": { eyebrow: "Games", title: "Line Rider", body: "Ride the line; score-only.", dependency: "the arcade" },
  "/games/candle-hop": { eyebrow: "Games", title: "Candle Hop", body: "Hop the candles; score-only.", dependency: "the arcade" },
  "/trade-from-x": { eyebrow: "X-trade", title: "Trade from a post", body: "A post becomes a bounded trade.", dependency: "the X relay" },
  "/claim": { eyebrow: "X recovery", title: "Recover a trade from X", body: "Claim a trade an X post made for you.", dependency: "the X relay" },
  "/status": { eyebrow: "Status", title: "Is everything running?", body: "Chain, indexer, oracle and relay health.", dependency: "the status probes" },
  "/proof/[market]": { eyebrow: "Proof", title: "Don't trust it. Click it.", body: "Both prints, their signers, verified in your browser.", dependency: "the print verifiers and the proof page" },
  "/how-it-works": { eyebrow: "How it works", title: "From a call to a receipt", body: "Passkeys, dollars, Windows and verdicts.", dependency: "the public story" },
  "/demo": { eyebrow: "Demo", title: "The whole product, walked through", body: "Sign-up to a paid verdict, walked through.", dependency: "the public story" },
  "/pitch": { eyebrow: "Pitch", title: "Why Mitoshi", body: "The thesis in a few slides.", dependency: "the public story" },
  "/settings/account": { eyebrow: "Account & keys", title: "See and stop every key", body: "Every key and grant, each revocable here.", dependency: "the account trust surface" },
  "/native-auth": { eyebrow: "App sign-in", title: "Finishing sign-in in the app", body: "The app hands your sign-in back here.", dependency: "the native app handoff (SM2)" },
};

export function pendingFor(route: string): PendingCapability {
  const entry = PENDING[route];
  if (!entry) throw new Error(`no pending capability registered for ${route}`);
  return entry;
}
