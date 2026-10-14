import "server-only";
/**
 * The landing's live board (R4-13a, D-227; the role of Owarine 90a91d71:web/src/features/landing/{useLandingBoard,
 * useSettledWindows}.ts, read on the server): the Windows open now per asset with each asset's newest signed opening
 * print and shortest cadence, the open count per kind (crypto, stocks), and the last Windows to settle — all from the
 * indexer's tables of Moderato's events (`indexReader`). Read at request time (the caller awaits `connection()` in a
 * Suspense boundary) and kept a minute in memory; null when the index can't be read, so a section says so instead of
 * showing a made-up number.
 */
import { cacheLife } from "next/cache";
import { isTickerSymbol, TICKERS } from "@cwf/core";
import { indexReader, type IdxRow } from "@cwf/db/idx";
import { db } from "@/server/db";

export interface BoardAsset {
  symbol: string;
  kind: "crypto" | "stock";
  open: number;
  cadenceSec: number;
  /** The asset's newest signed print (open or close, any Window — `latestPrints`), 8 decimals, and when it was signed. */
  print: { priceE8: string; atSec: number; signers: number } | null;
}

export interface SettledWindow {
  market: string;
  symbol: string;
  cadenceSec: number;
  basis: number;
  expirySec: number;
  outcome: "up" | "down" | "void";
}

export interface LandingBoard {
  assets: BoardAsset[];
  open: { crypto: number; stock: number; all: number };
  settled: SettledWindow[];
}

function outcomeOf(row: IdxRow): SettledWindow["outcome"] {
  if (row.state === "voided" || Number(row.winner) === 2) return "void";
  return Number(row.winner) === 0 ? "up" : "down";
}

/** Throws when the index can't be read, so a failed read is never what the cache keeps. */
async function read(): Promise<LandingBoard> {
  "use cache";
  cacheLife("minutes");
  const r = indexReader(db());
  const nowSec = Math.floor(Date.now() / 1000);
  const [live, done] = await Promise.all([r.markets({ liveAtSec: nowSec, limit: 1000 }), r.markets({ settled: true, limit: 5 })]);
  const by = new Map<string, BoardAsset>();
  for (const row of live) {
    const symbol = String(row.symbol);
    if (!isTickerSymbol(symbol)) continue;
    const cadenceSec = Number(row.cadence_sec);
    const seen = by.get(symbol);
    if (!seen) {
      by.set(symbol, { symbol, kind: TICKERS[symbol].kind, open: 1, cadenceSec, print: null });
      continue;
    }
    seen.open += 1;
    seen.cadenceSec = Math.min(seen.cadenceSec, cadenceSec);
  }
  // Each asset's last signed print, from any Window (L02: the soonest Window's print is often still on its way).
  for (const row of await r.latestPrints([...by.keys()])) {
    const asset = by.get(String(row.symbol));
    if (asset && /^\d+$/.test(String(row.price_e8))) asset.print = { priceE8: String(row.price_e8), atSec: Number(row.source_ts_sec), signers: Number(row.signers ?? 0) };
  }
  // Crypto first, then the most Windows open (D-226: crypto leads the 24/7 lanes).
  const assets = [...by.values()]
    .sort((a, b) => (a.kind === b.kind ? b.open - a.open : a.kind === "crypto" ? -1 : 1))
    .map((a) => a);
  const count = (kind: BoardAsset["kind"]) => assets.filter((a) => a.kind === kind).reduce((n, a) => n + a.open, 0);
  return {
    assets,
    open: { crypto: count("crypto"), stock: count("stock"), all: count("crypto") + count("stock") },
    settled: done.map((row) => ({
      market: String(row.market),
      symbol: String(row.symbol),
      cadenceSec: Number(row.cadence_sec),
      basis: Number(row.basis),
      expirySec: Number(row.expiry_sec),
      outcome: outcomeOf(row),
    })),
  };
}

export async function landingBoard(): Promise<LandingBoard | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}
