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

const engine = "the market engine on Tempo (S2) and the first-call flow (S4)";

export const PENDING: Readonly<Record<string, PendingCapability>> = {
  "/markets": { eyebrow: "Markets", title: "Call where a price closes", body: "Live Windows for BTC, ETH, SOL and nine US stocks. Pick UP or DOWN, see your cost and the most you can lose, and get a receipt you can click.", dependency: engine },
  "/markets/[id]": { eyebrow: "Markets", title: "This Window", body: "A shared link to one Window opens it here with its live book, your position and its verdict.", dependency: engine },
  "/portfolio": { eyebrow: "Portfolio", title: "Your positions, money and verdicts", body: "Open calls, settled Windows paid automatically, leftovers to collect in one tap, and every stock and theme you hold.", dependency: engine },
  "/stocks": { eyebrow: "Stocks", title: "Tokenized stocks on Tempo", body: "Buy and sell stock tokens bridged from Robinhood Chain, priced against signed quotes, with the reserve backing every token shown.", dependency: "the stock pools and price guard (S15)" },
  "/stocks/[symbol]": { eyebrow: "Stocks", title: "One stock", body: "Price, your holdings, the reserve behind the token, and the calls on this ticker.", dependency: "the stock pools and price guard (S15)" },
  "/themes": { eyebrow: "Themes", title: "Baskets that rebalance themselves", body: "Follow a theme and its agent keeps your stock tokens at the target weights, inside caps you set and can revoke.", dependency: "the theme router and agent (S16)", links: [{ href: "/themes/create", label: "Create a theme" }] },
  "/themes/[slug]": { eyebrow: "Themes", title: "One theme", body: "Weights, rebalance history with receipts, and follow or unfollow in one step.", dependency: "the theme router and agent (S16)" },
  "/themes/create": { eyebrow: "Themes", title: "Create a theme", body: "Pick the tickers, the envelope the agent may move within, and your fee.", dependency: "the theme router and agent (S16)" },
  "/bridge": { eyebrow: "Bridge", title: "Move stock tokens to Tempo", body: "Bring Robinhood Chain stock tokens over LayerZero, with a tracker that survives closing the app.", dependency: "the bridge adapters and lockboxes (S14)" },
  "/reserves": { eyebrow: "Reserves", title: "Every bridged token, backed", body: "Locked on Robinhood Chain versus supply on Tempo, per ticker, as of a block you can re-read.", dependency: "the bridge adapters and lockboxes (S14)" },
  "/launch": { eyebrow: "Launch", title: "Launch a token", body: "Issue a USD stablecoin with its own market, or a memecoin on a bonding curve that graduates to a pool.", dependency: "the launchpads (S17)", links: [{ href: "/launch/stablecoin", label: "Launch a stablecoin" }, { href: "/launch/meme", label: "Launch a memecoin" }] },
  "/launch/stablecoin": { eyebrow: "Launch", title: "Launch a stablecoin", body: "One confirmation creates the token, its DEX pair and its fee liquidity.", dependency: "the launch registry (S17)" },
  "/launch/meme": { eyebrow: "Launch", title: "Launch a memecoin", body: "A bonding curve with anti-snipe fees that graduates to a Uniswap v4 pool.", dependency: "the curve launchpad (S17)" },
  "/launch/[token]": { eyebrow: "Launch", title: "One launch", body: "Curve progress, trades and holders.", dependency: "the curve launchpad (S17)" },
  "/earn": { eyebrow: "Earn", title: "Back the market makers", body: "Supply to the maker vault and see realised and on-paper results per Window.", dependency: "the maker vault (S8)" },
  "/parlay": { eyebrow: "Parlay", title: "Combine calls", body: "Stack several Windows into one ticket priced from their books.", dependency: "the parlay reserve (S10)" },
  "/surface": { eyebrow: "Market Surface", title: "The market's shape", body: "Term structure and depth across every live Window.", dependency: "the parlay and range products (S10)" },
  "/games": { eyebrow: "Games", title: "Play the markets", body: "Duels over live decks, Lucky, Range, Moonshot and score-only arcade runs.", dependency: `${engine}, and the games (S12)` },
  "/games/practice": { eyebrow: "Games", title: "Practice", body: "Learn the swipe loop with no stake.", dependency: "the games (S12)" },
  "/games/duel": { eyebrow: "Games", title: "Duel", body: "Face another player over a live deck; picks ride a scoped key, no prompt per card.", dependency: "the arena (S12)" },
  "/games/duel/[matchId]": { eyebrow: "Games", title: "A duel", body: "Named waits, your picks and the settlement.", dependency: "the arena (S12)" },
  "/games/history": { eyebrow: "Games", title: "Your games", body: "Every duel and run you played.", dependency: "the arena (S12)" },
  "/games/rank": { eyebrow: "Games", title: "Season ranks", body: "Standings for this season's duels.", dependency: "the arena (S12)" },
  "/games/lucky": { eyebrow: "Games", title: "Lucky", body: "Let the reel pick a live call.", dependency: "the games (S12)" },
  "/games/range": { eyebrow: "Games", title: "Range", body: "Pick the band where price finishes.", dependency: "the range reserve (S10)" },
  "/games/moonshot": { eyebrow: "Games", title: "Moonshot", body: "Aim for a distant target.", dependency: "the range reserve (S10)" },
  "/games/line-rider": { eyebrow: "Games", title: "Line Rider", body: "Ride the line; score-only.", dependency: "the arcade (S12)" },
  "/games/candle-hop": { eyebrow: "Games", title: "Candle Hop", body: "Hop the candles; score-only.", dependency: "the arcade (S12)" },
  "/strategies": { eyebrow: "Strategies", title: "Repeatable approaches", body: "Strategies with their verified records, run by agents under a budget you grant.", dependency: "the agent runner (S9)" },
  "/agents": { eyebrow: "Agents", title: "Copy an agent", body: "One confirmation to copy, one to stop; caps behind “adjust”.", dependency: "the agent runner (S9)" },
  "/trade-from-x": { eyebrow: "X-trade", title: "Trade from a post", body: "Turn a post into a bounded trade under a grant you control.", dependency: "the X relay (S11)" },
  "/claim": { eyebrow: "X recovery", title: "Recover a trade from X", body: "Claim a trade an X post created for you.", dependency: "the X relay (S11)" },
  "/status": { eyebrow: "Status", title: "Is everything running?", body: "Chain, indexer, oracle freshness, relay balance and every service we depend on.", dependency: "the status probes (S5)" },
  "/proof/[market]": { eyebrow: "Proof", title: "Don't trust it. Click it.", body: "Both prints, their signers, and a re-verification you run in your browser.", dependency: "the print verifiers (S2) and the proof page (S5)" },
  "/how-it-works": { eyebrow: "How it works", title: "From a call to a receipt", body: "Passkeys, dollars, Windows, verdicts and stock tokens, explained once.", dependency: "the public story (S20)" },
  "/demo": { eyebrow: "Demo", title: "The whole product, walked through", body: "A guided run from sign-up to a paid verdict.", dependency: "the public story (S20)" },
  "/pitch": { eyebrow: "Pitch", title: "Why Mitoshi", body: "The thesis in a few slides.", dependency: "the public story (S20)" },
  "/settings/account": { eyebrow: "Account & keys", title: "See and stop every key", body: "Your passkey devices and every live trading key and grant — its scope, what it may still spend, when it expires — each revocable in one place.", dependency: "the account trust surface (S1 settings step)" },
  "/native-auth": { eyebrow: "App sign-in", title: "Finishing sign-in in the app", body: "The app hands your sign-in back here.", dependency: "the native app handoff (SM2)" },
};

export function pendingFor(route: string): PendingCapability {
  const entry = PENDING[route];
  if (!entry) throw new Error(`no pending capability registered for ${route}`);
  return entry;
}
