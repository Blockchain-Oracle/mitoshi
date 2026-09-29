/**
 * S15c: creates the guarded stock pools on Moderato (plan B.3.4, D-105, D-107) and records them in
 * `contracts/deployments/42431/pools.json`.
 *
 *   pnpm --dir scripts exec tsx v4/create-stock-pools.ts [--dry] [TSLA AMZN …]
 *   (HOUSE_ROLE=deployer-products by default; TEMPO_RPC_HTTP_URL may point at an `anvil --network tempo` fork)
 *
 * Per ticker, idempotent: the pool must be registered with the StockGuardHook (DeployStockGuardHook did all five); a
 * mirror without a signed feed (NFLX, Q-011) stays registered-uninitialized. Otherwise one house batch:
 *   pushRedStone(mirror, latest production-signed payload)             — the reference the guard checks the init against
 *   [pathUSD, mirror].approve(Permit2) · Permit2.approve(→ PositionManager)
 *   PositionManager.multicall([initializePool(key, sqrt(reference × multiplier)),
 *                              modifyLiquidities(MINT_POSITION × k + SETTLE_PAIR)])
 * The house plan (`@cwf/core/stocks/housePlan`): of the house's mirror balance above the 5 kept for bridge demos (≤ 30),
 * 80 % ±12 % + 20 % full range paired with equal pathUSD, plus the $20k pathUSD bid ladder over −1 %…−15 %. Mirrors come
 * only from the bridge (no other mint, no fake backing); with none, the pool is initialized with its ladder and
 * `topup.ts` seeds the pairs once bridged inventory arrives.
 */
import { execSync } from "node:child_process";
import { planHouse } from "@cwf/core/stocks/housePlan";
import { poolId } from "@cwf/markets/v4";
import { castBatch, loadRole, PATH_USD } from "./lib";
import {
  INIT_TOPIC, KEEP, LADDER_USD, SEED_MAX, TICKERS, balanceOf, feedOf, freshSpot, guardRegistered, houseCalls, keyOf, mintedTokenIds,
  mirrorOf, priceFromSpot, pushRedStoneCall, readPools, slot0, writePools, type Ticker,
} from "./stock-pools-lib";

const dry = process.argv.includes("--dry");
const wanted = (process.argv.slice(2).filter((a) => !a.startsWith("--")) as Ticker[]).filter((t) => TICKERS.includes(t));
const tickers = wanted.length ? wanted : [...TICKERS];
const role = process.env.HOUSE_ROLE ?? "deployer-products";
const house = loadRole(role).address;
const commit = execSync("git rev-parse --short HEAD").toString().trim();
const file = readPools(house, commit);

for (const t of tickers) {
  const key = keyOf(t);
  const id = poolId(key);
  const mirror = mirrorOf(t);
  const rec = (file.pools[t] ??= { ticker: t, mirror, poolId: id, poolKey: key, status: "registered-uninitialized", positions: [] });
  if (!(await guardRegistered(key))) throw new Error(`${t}: pool ${id} is not registered with the hook (run DeployStockGuardHook)`);
  const s0 = await slot0(key);
  if (s0.sqrtPriceX96 !== 0n) {
    console.log(`${t}: already initialized (sqrtP ${s0.sqrtPriceX96}, tick ${s0.tick}) — use topup.ts`);
    rec.status = "initialized";
    continue;
  }
  const feed = await feedOf(mirror);
  if (!feed) {
    rec.status = "registered-uninitialized";
    rec.reason = "no signed price source on Tempo (RedStone has no NFLX; Data Streams needs credentials, Q-011) — the guard can't initialize it (D-107)";
    console.log(`${t}: registered, not initialized — ${rec.reason}`);
    continue;
  }
  const spot = await freshSpot(feed);
  const { mult, price, sqrtPriceX96 } = await priceFromSpot(mirror, spot.medianE8);
  const [mirrorBal, usdBal] = await Promise.all([balanceOf(mirror, house), balanceOf(PATH_USD, house)]);
  const seed = mirrorBal > KEEP ? (mirrorBal - KEEP < SEED_MAX ? mirrorBal - KEEP : SEED_MAX) : 0n;
  const positions = planHouse({ sqrtPriceX96, tokenPriceE18: price, mirror: seed, ladderUsd: LADDER_USD });
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const { calls, need0, need1 } = houseCalls({ key, initSqrtPriceX96: sqrtPriceX96, positions, owner: house, nowSec });
  if (need0 > usdBal) throw new Error(`${t}: needs ${need0} pathUSD units, house has ${usdBal}`);
  const batch = [pushRedStoneCall(mirror, spot.payload), ...calls];
  console.log(`${t}: ${feed} ${Number(spot.medianE8) / 1e8} @${spot.tMs / 1000} × m ${Number(mult) / 1e18} → sqrtP ${sqrtPriceX96}; inventory ${mirrorBal} (seed ${seed}); positions ${positions.map((p) => p.label).join(",") || "none"}; pathUSD ${need0}, mirror ${need1}; ${batch.length} calls`);
  if (dry) continue;
  const r = castBatch(batch, { signer: { role } });
  const inits = r.logs.filter((l) => l.topics[0] === INIT_TOPIC && l.topics[1] === id).length;
  if (r.status !== "0x1" || inits !== 1) throw new Error(`${t}: house batch failed (${r.transactionHash}, status ${r.status}, Initialize ${inits})`);
  const after = await slot0(key);
  const ids = mintedTokenIds(r.logs, house);
  if (ids.length !== positions.length) throw new Error(`${t}: minted ${ids.length} NFTs, planned ${positions.length}`);
  rec.status = "initialized";
  delete rec.reason;
  rec.init = { tx: r.transactionHash, block: Number(BigInt(r.blockNumber)), sqrtPriceX96: after.sqrtPriceX96.toString(), tick: after.tick, referenceE8: spot.medianE8.toString(), referenceAt: spot.tMs / 1000, multiplierE18: mult.toString(), tokenPriceE18: price.toString() };
  rec.positions.push(...positions.map((p, i) => ({ tokenId: ids[i]!.toString(), label: p.label, tickLower: p.tickLower, tickUpper: p.tickUpper, liquidity: p.liquidity.toString(), amount0: p.amount0.toString(), amount1: p.amount1.toString(), tx: r.transactionHash })));
  console.log(`${t}: tx ${r.transactionHash} block ${BigInt(r.blockNumber)} gas ${BigInt(r.gasUsed)}; tick ${after.tick}; NFTs ${ids.join(",")}`);
  writePools(file, commit);
}
if (!dry) writePools(file, commit);
console.log(`pools.json: ${Object.values(file.pools).map((p) => `${p.ticker}=${p.status}`).join(" ")}`);

