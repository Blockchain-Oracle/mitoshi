/**
 * A pathname → its route template for field metrics (D-071): ids, addresses and symbols collapse to `[param]` so p75s
 * group by page, not by market or wallet. Unknown shapes fall back to the path with id-like segments replaced.
 */
const PARAM_AFTER: Record<string, string> = { markets: "[id]", tickers: "[symbol]", themes: "[slug]", launch: "[token]", u: "[address]", proof: "[market]", duel: "[matchId]" };
const FIXED = new Set(["create", "stablecoin", "meme", "edge", "practice", "history", "rank", "lucky", "range", "moonshot", "line-rider", "candle-hop"]);

export function routeTemplate(pathname: string): string {
  const parts = pathname.split("?")[0]!.split("/").filter(Boolean).slice(0, 6);
  const out = parts.map((seg, i) => {
    const prev = parts[i - 1];
    if (prev && PARAM_AFTER[prev] && !FIXED.has(seg)) return PARAM_AFTER[prev]!;
    return /^0x[0-9a-fA-F]+$/.test(seg) || /^\d+$/.test(seg) || seg.length > 40 ? "[id]" : seg;
  });
  return `/${out.join("/")}`.slice(0, 120);
}
