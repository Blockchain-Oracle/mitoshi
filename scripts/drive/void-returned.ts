/**
 * S4 "Returned" on real voids (S4-fix, D-153): the Windows that voided on Moderato during the S3 soak's RPC defect
 * (2026-09-29, `void_reason` 1 = missing print, D-130/D-131) and that real orders had crossed on. For every holder of
 * every fill there, the production provider's `getPinnedVerdict` — the read the UI's pinned card and ClaimWinnings
 * render — must stamp the call a void, and the engine's own `Redeemed` event (the settler's `redeemFor`) must show the
 * stake returned. Nothing here is sent; every hash printed is for `cast receipt`.
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/void-returned.ts [--index https://testnet.mitoshi.xyz/api/index]
 */
import type { Address } from "viem";
import type { MarketId } from "@cwf/core";
import { createMarketsProvider, nowSec, readWindows, redeemedEvents } from "@cwf/markets";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const index = arg("index", "https://testnet.mitoshi.xyz/api/index");
const HOLDER_BUDGET_MS = Number(arg("holder-ms", "180000"));
const out = (step: string, data: Record<string, unknown>) => console.log(JSON.stringify({ step, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

interface Row { market: MarketId; symbol: string; cadence_sec: number; trading_start_sec: string; void_reason: number; trade_count: string }
interface Fill { maker: Address; taker: Address; tx_hash?: string; tx?: string }

const voided = ((await (await fetch(`${index}/markets?state=voided&limit=1000`)).json()) as { rows: Row[] }).rows.filter((r) => Number(r.trade_count) > 0);
out("voided-with-fills", { count: voided.length });
const provider = createMarketsProvider();
await provider.syncClock();

let returned = 0;
for (const w of voided) {
  const facts = (await readWindows([w.market])).get(w.market);
  const fills = ((await (await fetch(`${index}/fills?market=${w.market}`)).json()) as { rows: Fill[] }).rows;
  const holders = [...new Set(fills.flatMap((f) => [f.maker.toLowerCase(), f.taker.toLowerCase()]))] as Address[];
  out("window", { market: w.market, symbol: w.symbol, cadenceSec: w.cadence_sec, tradingStart: new Date(Number(w.trading_start_sec) * 1000).toISOString(), chainState: facts?.snapshot.state, voidReason: w.void_reason, fills: fills.map((f) => f.tx_hash ?? f.tx) });
  for (const holder of holders) {
    // A house wallet (the seed maker, the house taker) has thousands of fills to scan for its cost basis; bound each.
    const reading = await Promise.race([
      provider.getPinnedVerdict(holder, w.market),
      new Promise<never>((_, no) => setTimeout(() => no(new Error(`verdict read over ${HOLDER_BUDGET_MS} ms`)), HOLDER_BUDGET_MS)),
    ]).catch((e: Error) => ({ ok: false as const, error: { technical: e.message } }));
    const v = reading.ok ? reading.value : null;
    const redeemed = await redeemedEvents(holder, w.market).catch(() => []);
    const isVoid = v?.verdict?.outcome === "void";
    if (isVoid && v?.phase === "paid") returned += 1;
    out("holder", {
      market: w.market, holder, phase: v?.phase ?? null, verdict: v?.verdict?.outcome ?? null, payoutBase: v?.verdict?.payoutBase ?? null, costBasisBase: v?.verdict?.costBasisBase ?? null, paidBy: v?.paidBy ?? null, paidBase: v?.paidBase ?? null, txHash: v?.txHash ?? null,
      redeemed: redeemed.map((r) => ({ tx: r.txHash, by: r.by, yesLots: r.yesLots, noLots: r.noLots, payout: r.payout, total: r.total })),
      error: reading.ok ? undefined : (reading.error as { technical?: string }).technical,
    });
  }
}
out("summary", { windows: voided.length, returnedAndPaid: returned, atSec: nowSec() });
process.exit(0);
