// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:web/src/app/api/index/[...path]/{queries,queries-archive,queries-proof,queries-tape,queries-status}.ts
// (Solana ids → 0x market ids and addresses; seats/books dropped; claims and the C.4.5 path table added).
/**
 * The `/api/index/*` path table (plan C.4.5): each entry validates its segments and query, then runs one reader query.
 * Integers stay the decimal strings Postgres returns; limits are clamped by the reader (≤ 1,000). Public answers ride a
 * 2 s shared cache, wallet answers are never cached. Areas whose contracts are not deployed on this network answer a
 * named 404 (`not-deployed`), never an empty list that looks like "nothing happened".
 */
import { isAddress, isBytes32, TICKER_SYMBOLS } from "@cwf/core";
import type { IdxRow, IndexReader } from "@cwf/db/idx";
import type { Sql } from "@cwf/db";
import { z } from "zod";

export interface IndexQuery {
  scope: "public" | "wallet";
  cacheControl?: string;
  run(reader: IndexReader, sql: Sql): Promise<IdxRow[]>;
}

export class BadRequest extends Error {}
export class NotDeployed extends Error {}

const int = z.coerce.number().int().nonnegative();
const optionalInt = int.optional();
const flag = z.enum(["0", "1"]).optional().transform((v) => v === "1");
const address = z.string().refine(isAddress, "expected a 20-byte 0x address").transform((a) => a.toLowerCase());
const marketId = z.string().refine(isBytes32, "expected a 32-byte 0x market id").transform((a) => a.toLowerCase());
const symbol = z.enum(TICKER_SYMBOLS);
const ids = z.string().transform((raw) => raw.split(",").filter(Boolean)).pipe(z.array(marketId).max(200)).optional();

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequest(parsed.error.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; "));
  return parsed.data;
}

const marketsQuery = z.object({
  state: z.enum(["open", "resolved", "voided"]).optional(),
  symbol: symbol.optional(),
  series: marketId.optional(),
  live: optionalInt,
  expiryFrom: optionalInt,
  expiryTo: optionalInt,
  limit: optionalInt,
  settled: flag,
  ids,
});
const pageQuery = z.object({ market: marketId.optional(), since: optionalInt, limit: optionalInt, offset: optionalInt });
const rangeQuery = z.object({ from: int, to: int, limit: optionalInt });

/** Areas indexed by later stages' projections: answered as not deployed until their fragment and projection land. */
const LATER_AREAS = new Set(["themes", "launch", "agents"]);

function walletQuery(wallet: string, resource: string | undefined, query: Record<string, string>): IndexQuery | null {
  const owner = parse(address, wallet);
  switch (resource) {
    case "fills": {
      const q = parse(pageQuery, query);
      return { scope: "wallet", run: (r) => r.walletFills(owner, { market: q.market, sinceSec: q.since, limit: q.limit, offset: q.offset }) };
    }
    case "positions": {
      const q = parse(z.object({ unredeemed: flag, limit: optionalInt }), query);
      return { scope: "wallet", run: (r) => r.positions(owner, { unredeemedOnly: q.unredeemed, limit: q.limit }) };
    }
    case "actions":
    case "history": {
      const q = parse(pageQuery, query);
      return { scope: "wallet", run: (r) => r.walletActions(owner, { limit: q.limit, offset: q.offset }) };
    }
    case "orders": {
      const q = parse(z.object({ market: marketId.optional(), open: flag, limit: optionalInt }), query);
      return { scope: "wallet", run: (r) => r.orders({ owner, market: q.market, openOnly: q.open, limit: q.limit }) };
    }
    case "claims":
      return { scope: "wallet", run: (r) => r.claims(owner) };
    case "vault":
      return { scope: "wallet", run: (r) => r.vault(owner) };
    default:
      return null;
  }
}

/** Null when the path names nothing; throws `BadRequest` for a malformed parameter, `NotDeployed` for a later area. */
export function resolveIndexQuery(path: readonly string[], query: Record<string, string>, chainId: number): IndexQuery | null {
  const [head, second, third, ...rest] = path;
  if (rest.length > 0 || !head) return null;
  if (LATER_AREAS.has(head)) throw new NotDeployed(`${head} is not indexed on this network yet`);
  switch (head) {
    case "markets": {
      if (third !== undefined) return null;
      if (second !== undefined) {
        const market = parse(marketId, second);
        return { scope: "public", run: (r) => r.markets({ market, limit: 1 }) };
      }
      const q = parse(marketsQuery, query);
      if (q.ids) {
        const list = q.ids;
        return { scope: "public", run: (r) => r.markets({ ids: list, limit: list.length }) };
      }
      return { scope: "public", run: (r) => r.markets({ state: q.state, symbol: q.symbol, series: q.series, settled: q.settled, liveAtSec: q.live, expiryFromSec: q.expiryFrom, expiryToSec: q.expiryTo, limit: q.limit }) };
    }
    case "wallet":
      return second === undefined ? null : walletQuery(second, third, query);
    case "fills": {
      if (second !== undefined) return null;
      const q = parse(pageQuery, query);
      return { scope: "public", run: (r) => r.fills({ market: q.market, sinceSec: q.since, limit: q.limit, offset: q.offset }) };
    }
    case "tape": {
      if (second !== undefined) return null;
      const q = parse(pageQuery, query);
      return { scope: "public", run: (r) => r.fills({ sinceSec: q.since, limit: q.limit ?? 100, offset: q.offset }) };
    }
    case "prints": {
      if (second === undefined || third !== undefined) return null;
      if (/^0x/.test(second)) {
        const market = parse(marketId, second);
        return { scope: "public", run: (r) => r.prints(market) };
      }
      const ticker = parse(symbol, second);
      const q = parse(rangeQuery, query);
      return { scope: "public", run: (r) => r.printHistory(ticker, q.from, q.to, q.limit) };
    }
    case "candles": {
      if (second === undefined || third !== undefined) return null;
      const market = parse(marketId, second);
      const q = parse(rangeQuery, query);
      return { scope: "public", run: (r) => r.candles(market, q.from, q.to) };
    }
    case "proof": {
      if (second === undefined || third !== undefined) return null;
      const market = parse(marketId, second);
      return {
        scope: "public",
        run: async (r, sql) => {
          const [m] = await r.markets({ market, limit: 1 });
          const cached = await sql`select which, verified, detail, checked_at from print_proofs where chain_id = ${chainId} and market = ${market} order by which`;
          return m ? [{ ...m, proofs: cached }] : [];
        },
      };
    }
    case "archive": {
      if (second === undefined || third !== undefined) return null;
      const feed = parse(z.string().regex(/^[A-Z0-9_]{2,40}(---[A-Z0-9_]+)?$/), second);
      const q = parse(rangeQuery, query);
      return {
        scope: "public",
        cacheControl: "public, s-maxage=60, stale-while-revalidate=300",
        run: async (_r, sql) => sql`
          select t_sec::text, complete, summary -> ${feed}::text as summary, feeds -> ${feed}::text as packages from print_archive
          where source = 'redstone' and t_sec between ${q.from} and ${q.to} and feeds ? ${feed} order by t_sec limit ${Math.min(q.limit ?? 300, 1000)}`,
      };
    }
    case "status":
      return second === undefined ? { scope: "public", run: async (r) => [await r.status()] } : null;
    default:
      return null;
  }
}
