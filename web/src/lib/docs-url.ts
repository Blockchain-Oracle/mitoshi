// Ported from Masayume 68f7a09:web/src/lib/docs-url.ts; the guides' host as Owarine 90a91d71:web/src/lib/docs-url.ts
// has it (D-227).
/**
 * "Docs" is the documentation site (`docs-site/`, Fumadocs) at docs.mitoshi.xyz (D-228). The app keeps no docs of its
 * own (D-230, the owner's point 7): `/docs` and every `/docs/*` path answer a 308 to the matching guide (`proxy.ts`),
 * and every docs link in the app opens the site. `NEXT_PUBLIC_DOCS_URL` names another host (a local preview); a value
 * that isn't an absolute http(s) URL is ignored, so a docs link can never point back at the app's retired `/docs`.
 */
const DEFAULT_DOCS = "https://docs.mitoshi.xyz";

function docsOrigin(raw: string | undefined): string {
  const value = raw?.trim().replace(/\/+$/, "");
  return value && /^https?:\/\/[^/]/.test(value) ? value : DEFAULT_DOCS;
}

export const DOCS_URL = docsOrigin(process.env.NEXT_PUBLIC_DOCS_URL);

/**
 * Every guide on the docs site (`docs-site/content/docs/<section>/<page>.mdx`); `docs-url.test.ts` checks this list
 * equals the site's pages, so an app link to a guide can't 404.
 */
export const GUIDES = [
  "start/quickstart", "start/account", "start/one-tap", "start/find-your-way", "start/install", "start/mobile-app",
  "trading/markets", "trading/terminal", "trading/windows", "trading/exits", "trading/settlement", "trading/fees",
  "trading/proof", "trading/portfolio", "trading/trading-balance", "trading/earn", "trading/range-and-moonshot",
  "trading/parlay-boost-private",
  "automate/overview", "automate/agents", "automate/copy-strategies", "automate/memory-market",
  "games/overview", "games/practice-and-arcade", "games/duel-and-lucky",
  "explore/record", "explore/social",
  "x/sign-in", "x/trade-from-x", "x/claim",
  "stocks/overview", "stocks/bridge", "stocks/reserves", "stocks/themes", "stocks/follow-a-theme", "stocks/launch",
  "stocks/launchpads", "stocks/pools-and-guard",
  "safety/who-can-do-what", "safety/worst-case", "safety/if-mitoshi-stops",
  "architecture/overview", "architecture/contracts", "architecture/deployments", "architecture/prices",
  "architecture/relay-and-keys", "architecture/ops-and-indexer", "architecture/built-on",
  "builders/api", "builders/local-setup", "builders/source-map",
  "help/availability", "help/faq", "help/troubleshooting", "help/glossary", "help/evidence",
] as const;
export type Guide = (typeof GUIDES)[number];
const GUIDE_SET: ReadonlySet<string> = new Set(GUIDES);

/** A guide on the docs site; no argument is the site's home. */
export function docsUrl(guide?: Guide): string {
  return guide ? `${DOCS_URL}/${guide}` : DOCS_URL;
}

/** The app's retired in-app pages (`/docs/<slug>`, S20 → R4-10) and the guide that now covers each. */
export const RETIRED_DOCS: Readonly<Record<string, Guide>> = {
  account: "start/account",
  "one-tap": "start/one-tap",
  terminal: "trading/terminal",
  windows: "trading/windows",
  exits: "trading/exits",
  games: "trading/range-and-moonshot",
  settlement: "trading/settlement",
  fees: "trading/fees",
  record: "explore/record",
  contracts: "architecture/deployments",
  testnet: "help/availability",
};

/**
 * Where an app path under `/docs` goes (D-230): a retired page to its guide, `/docs/<section>/<page>` to that guide when
 * the site has it, and anything else to the site's home — never a 404. Null for every other path.
 */
export function docsRedirect(pathname: string): string | null {
  if (pathname !== "/docs" && !pathname.startsWith("/docs/")) return null;
  const rest = pathname.slice("/docs".length).replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!rest) return DOCS_URL;
  const retired = Object.hasOwn(RETIRED_DOCS, rest) ? RETIRED_DOCS[rest] : undefined;
  if (retired) return docsUrl(retired);
  return GUIDE_SET.has(rest) ? docsUrl(rest as Guide) : DOCS_URL;
}
