import { configureMarkets, createMarketsProvider, parseMarketsEnv } from "@cwf/markets";
configureMarkets(parseMarketsEnv({ network: "testnet", opsUrl: "https://ops.mitoshi.xyz" }));
const p = createMarketsProvider();
await p.syncClock();
const r = await p.listLiveLanes();
if (!r.ok) { console.log(r.error); process.exit(1); }
for (const l of r.value.lanes) console.log(l.label, l.basis, l.intervalSec, l.markets.length, l.markets.slice(0,4).map(m=>`${m.asset}:${m.openingPriceRaw!==null?'open':'-'}:${m.status}`).join(" "));
const m = r.value.lanes[0]!.markets[0]!;
console.log(JSON.stringify(m, (_k, v) => typeof v === "bigint" ? v.toString() : v));
const d = await p.getBookDepth({ marketId: m.marketId, decimals: m.decimals });
console.log(JSON.stringify(d, (_k, v) => typeof v === "bigint" ? v.toString() : v).slice(0, 600));
