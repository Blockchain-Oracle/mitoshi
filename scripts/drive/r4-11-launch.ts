/**
 * R4-11 live check (D-227) on Moderato: a memecoin launched and traded with the exact calls the app sends — every write
 * is `encodeLaunchIntent` (the tx lane's launch encoder) sent by `cast` from the launch lane key (self-paid here; the app
 * rides the relay) — and every figure read back through the app's own reads (`@cwf/markets/launch` reads.ts):
 *   templates → create + creator buy → (anti-snipe decays) → buy at the curve quote → sell half → the list, the launch,
 *   its trades and the position as /launch and /launch/[token] read them; plus the V4Quoter on the graduated MITO1602.
 *
 *   tsx scripts/drive/r4-11-launch.ts [--role deployer-launch]
 */
import { configureMarkets, parseMarketsEnv } from "@cwf/markets";
import type { TxIntent } from "@cwf/core";
import { quoteBuy } from "@cwf/core";
import {
  encodeLaunchIntent, getMemeLaunch, getMemePosition, getMemeTrades, listLaunches, listMemeTemplates, memeAddresses, predictMemecoinAddress,
  quoteMemeBuy, quoteMemeSell, quotePoolSwap, randomSalt, readMemeReceipt, withSlippage,
} from "@cwf/markets/launch";
import { getAddress } from "viem";
import { castBatch } from "../lib/cast";
import { loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const role = argv.includes("--role") ? argv[argv.indexOf("--role") + 1]! : "deployer-launch";
configureMarkets(parseMarketsEnv({ network: "testnet" }));
const me = getAddress(loadRole(role).address);
const a = memeAddresses(42431);
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const must = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`read failed: ${json(r.error)}`);
  return r.value;
};

function send(step: string, intent: TxIntent) {
  const e = encodeLaunchIntent(intent, { chainId: 42431, wallet: me });
  if (!e?.ok) throw new Error(`${step}: not encoded — ${e ? e.diagnosis.technical : "unclaimed"}`);
  // `cast` waits for the receipt itself; the public RPC sometimes answers that poll with null after the tx landed, so
  // the step is resumable (`--token`) rather than resent.
  const r = castBatch(e.value.calls, { signer: { role } });
  console.log(`${step.padEnd(14)} ${r.transactionHash} block ${BigInt(r.blockNumber)} gas ${BigInt(r.gasUsed)} status ${r.status} (sponsored in the app: ${e.value.sponsored})`);
  if (r.status !== "0x1") throw new Error(`${step} reverted`);
  for (const ev of readMemeReceipt({ logs: r.logs }, a)) console.log(`    ${ev.name} ${json(ev.args)}`);
  return r;
}

const templates = must(await listMemeTemplates());
const t = templates[0]!;
console.log(`templates ${templates.length}: #${t.configId} graduates at ${t.migrationQuoteThreshold} base, max creator buy ${t.maxCreatorBuyBps} bps`);

const resume = argv.includes("--token") ? getAddress(argv[argv.indexOf("--token") + 1]!) : null;
const salt = randomSalt();
const symbol = `R4L${String(Date.now()).slice(-4)}`;
const token = resume ?? predictMemecoinAddress(a.launchpad, me, salt);
if (!resume) {
  const creatorBuy = 10_000_000n;
  const q0 = quoteBuy({ segments: t.segments, sqrtStartX96: t.sqrtStartX96, sqrtEndX96: t.sqrtEndX96 }, { sqrtPriceX96: t.sqrtStartX96, segment: 0 }, BigInt(t.fees.base), creatorBuy);
  send("create", { kind: "launch-meme-create", configId: t.configId, name: "R4-11 Launch Check", symbol, logoURI: "", metadataURI: "", salt, creatorBuyQuote: creatorBuy, minCoinOut: withSlippage(q0.coinOut, 100) });
}
console.log(`token ${token}`);

for (let i = 0; i < 24; i++) {
  const m = must(await getMemeLaunch(token))!;
  if (m.feeBpsNow <= BigInt(t.fees.base)) break;
  console.log(`  anti-snipe fee now ${m.feeBpsNow} bps; waiting`);
  await new Promise((r) => setTimeout(r, 10_000));
}

const m1 = must(await getMemeLaunch(token))!;
const buyIn = 5_000_000n;
const qb = quoteMemeBuy(m1, buyIn);
send("buy", { kind: "launch-meme-buy", token, quoteIn: buyIn, minCoinOut: withSlippage(qb.coinOut, 100) });

const held = must(await getMemePosition(token, me))!.coin;
const m2 = must(await getMemeLaunch(token))!;
const half = held / 2n;
const qs = quoteMemeSell(m2, half);
send("sell", { kind: "launch-meme-sell", token, coinIn: half, minQuoteOut: withSlippage(qs.quoteOut, 100) });

const list = must(await listLaunches());
const row = list.find((r) => r.token.toLowerCase() === token.toLowerCase());
console.log(`listLaunches: ${list.length} launch(es); ours ${row ? `${row.kind} ${row.symbol} stage ${row.meme?.stage} progress ${row.meme?.progressBps} bps price ${row.meme?.priceE18}` : "MISSING"}`);
const m3 = must(await getMemeLaunch(token))!;
console.log(`getMemeLaunch: stage ${m3.stage} reserve ${m3.quoteReserve} sold ${m3.coinSold} price ${m3.priceE18} fee ${m3.feeBpsNow} bps`);
const trades = must(await getMemeTrades(token));
console.log(`getMemeTrades: ${trades.length} — ${trades.map((x) => `${x.isBuy ? "buy" : "sell"} ${x.quote}/${x.coin}`).join(", ")}`);
const pos = must(await getMemePosition(token, me))!;
console.log(`getMemePosition: coin ${pos.coin} value ${pos.valueAtCurve} exit ${pos.exitQuote} share ${pos.shareBps} bps`);

const grad = list.find((r) => r.meme?.stage === "graduated");
if (grad) {
  const g = must(await getMemeLaunch(grad.token))!;
  const tier = g.graduation!.tier;
  const out = must(await quotePoolSwap({ token: grad.token, fee: g.config.poolFees[tier]!, tickSpacing: g.config.tickSpacings[tier]!, buyCoin: true, amountIn: 1_000_000n }));
  console.log(`quotePoolSwap ${grad.symbol}: 1 pathUSD → ${out} coin base units (V4Quoter, tier ${tier})`);
}

// The read runtime keeps its sockets open; the check is done.
process.exit(0);
