/**
 * The room gate's question (S13): has this address ever made a call on this Window, or on any Window of this ticker?
 * Answered from the index: a fill on either side as the address itself, a Trading Balance execution the vault recorded
 * for it as owner, or a seat in `bettors` (a route that registered one). "Ever", not "holds now": a call that was
 * closed or settled still earns the seat, as Agari's rooms ruled.
 */
import type { Sql } from "../index";

export async function hasCalled(sql: Sql, q: { address: string; market?: string | null; symbol?: string | null }): Promise<boolean> {
  const a = q.address.toLowerCase();
  if (!q.market && !q.symbol) return false;
  const market = q.market?.toLowerCase() ?? null;
  const [r] = await sql<{ yes: boolean }[]>`
    select (
      exists (select 1 from idx_fills f ${q.symbol ? sql`join idx_markets m on m.market = f.market and m.symbol = ${q.symbol}` : sql``}
              where (f.taker = ${a} or f.maker = ${a}) ${market ? sql`and f.market = ${market}` : sql``})
      or exists (select 1 from idx_vault_executions x ${q.symbol ? sql`join idx_markets m on m.market = x.market and m.symbol = ${q.symbol}` : sql``}
              where x.owner = ${a} ${market ? sql`and x.market = ${market}` : sql``})
      or exists (select 1 from bettors b ${q.symbol ? sql`join idx_markets m on m.market = b.market_id and m.symbol = ${q.symbol}` : sql``}
              where b.wallet = ${a} ${market ? sql`and b.market_id = ${market}` : sql``})
    ) as yes`;
  return r?.yes === true;
}
