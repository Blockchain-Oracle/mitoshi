/**
 * S17b live drive (plan B.5.2 gate) on Moderato, every send through `cast` (write-boundary) from the launch lane key:
 *   template (createConfig) → create (+ creator buy) → X5 checks → a squatter pre-initialises the tier-0 v4 pool and
 *   parks pathUSD above it → buys at the anti-snipe fee and after it, a sell → the last buy completes the curve →
 *   the launch keeper's pass graduates it (correcting the squatted pool) → a swap through the pinned UniversalRouter
 *   in the graduated pool → locker fee claim + unlocked withdrawal → launchpad fees + leftover claims.
 *
 *   tsx scripts/drive/launch-meme.ts [--rpc <url>] [--role deployer-launch]
 *
 * Prints every tx hash; `acceptance/S17.md` records them after `cast receipt`.
 */
import { type Address, type Hex, type PublicClient, createPublicClient, encodeFunctionData, erc20Abi, getAddress, http, parseAbi } from "viem";
import { tempoModerato } from "viem/chains";
import { V4 } from "@cwf/clients";
import { Q96, liquidityForQuote, sqrtPriceX96For, v4SqrtPrice } from "@cwf/core";
import {
  Bucket, PATH_USD, buildBuy, buildClaimFees, buildClaimLeftover, buildCreateConfig, buildCreateLaunch, buildLockerClaimFees,
  buildLockerWithdraw, buildPoolSwap, buildSell, memeAddresses, memePoolKey, quoteMemeBuy, quoteMemeSell, randomSalt, readMemeLaunch,
  readMemeReceipt, withSlippage,
} from "@cwf/markets/launch";
import { actionsAndParams, mintPosition, settlePair } from "@cwf/markets/v4";
import { type CastReceipt, castBatch } from "../lib/cast";
import { loadRole } from "../v4/lib";
import { keeperDeps, launchKeeperPass } from "../../services/ops/src/actors/launch-keeper/index";

const argv = process.argv.slice(2);
const arg = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const rpc = arg("--rpc") ?? process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const role = arg("--role") ?? "deployer-launch";
const me = getAddress(loadRole(role).address);
const client = createPublicClient({ chain: tempoModerato, transport: http(rpc) }) as unknown as PublicClient;
const a = memeAddresses(42431);
const v4 = V4[42431];
const opts = { rpc, signer: { role } };
const log: { step: string; hash: Hex; block: bigint; gas: bigint; status: string }[] = [];

function send(step: string, calls: { to: Address; data: Hex }[]): CastReceipt {
  const r = castBatch(calls, opts);
  const row = { step, hash: r.transactionHash, block: BigInt(r.blockNumber), gas: BigInt(r.gasUsed), status: r.status };
  log.push(row);
  console.log(`${step.padEnd(28)} ${row.hash} block ${row.block} gas ${row.gas} status ${row.status}`);
  if (r.status !== "0x1") throw new Error(`${step} reverted`);
  for (const e of readMemeReceipt({ logs: r.logs }, a)) console.log(`    ${e.name} ${JSON.stringify(e.args, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  return r;
}
const now = async () => (await client.getBlock()).timestamp;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── 1. template: $0.000001 → $0.000015 per coin, 5,000 pathUSD to graduate, anti-snipe 50 % → 1 % over 100 s ────────
const sqrtStart = sqrtPriceX96For(1n, 1_000_000n);
const sqrtUpper = sqrtPriceX96For(15n, 1_000_000n);
const cfg = send("createConfig", [buildCreateConfig(a.launchpad, {
  protocolShareBps: 2_000, partnerShareBps: 3_000, creatorShareBps: 5_000,
  fees: { base: 100, start: 5_000, period: 10, reduction: 490, mode: 0 },
  sqrtStartX96: sqrtStart,
  segments: [{ sqrtPriceUpperX96: sqrtUpper, liquidity: liquidityForQuote(sqrtStart, sqrtUpper, 6_000_000_000n) }],
  migrationQuoteThreshold: 5_000_000_000n,
  totalSupply: 2_000_000_000_000_000n,
  migrationFeeBps: 100,
  split: { partnerUnlocked: 1_000, partnerLocked: 1_000, partnerVesting: 1_000, creatorUnlocked: 2_000, creatorLocked: 2_000, creatorVesting: 3_000 },
  vestingCliff: 86_400, vestingDuration: 2_592_000,
  leftoverReceiver: me,
  poolFees: [10_000, 3_000, 500], tickSpacings: [200, 60, 10],
  maxCreatorBuyBps: 500,
})]);
const configId = Number(readMemeReceipt({ logs: cfg.logs }, a).find((e) => e.name === "ConfigCreated")!.args.configId);

// ── 2. create + creator buy (base fee, capped) ─────────────────────────────────────────────────────────────────────
const symbol = `MITO${Math.floor(Math.random() * 9000 + 1000)}`;
const launch = buildCreateLaunch({ launchpad: a.launchpad, creator: me, configId, name: `Mitoshi Meme ${symbol}`, symbol, logoURI: "", metadataURI: `https://mitoshi.xyz/launch/${symbol}`, salt: randomSalt(), creatorBuyQuote: 25_000_000n, minCoinOut: 1n });
send("createLaunch (+creator buy)", launch.calls);
const token = launch.token;
console.log(`token ${token} (${symbol}), config ${configId}`);

// ── 3. X5 live: the coin can't reach the PoolManager before graduation ─────────────────────────────────────────────
const tip403 = parseAbi(["function isAuthorizedRecipient(uint64,address) view returns (bool)", "function isAuthorizedMintRecipient(uint64,address) view returns (bool)"]);
const policy = await client.readContract({ address: token, abi: parseAbi(["function transferPolicyId() view returns (uint64)"]), functionName: "transferPolicyId" });
const pmRecipient = await client.readContract({ address: "0x403c000000000000000000000000000000000000", abi: tip403, functionName: "isAuthorizedRecipient", args: [policy, v4.poolManager] });
const pmMint = await client.readContract({ address: "0x403c000000000000000000000000000000000000", abi: tip403, functionName: "isAuthorizedMintRecipient", args: [policy, v4.poolManager] });
let transferToPm = "succeeded (unexpected)";
try {
  await client.call({ account: me, to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [v4.poolManager, 1n] }) });
} catch (e) {
  transferToPm = `reverted: ${(e as Error).message.split("\n")[0]}`;
}
console.log(`X5: policy ${policy}; PM recipient ${pmRecipient}, PM mint recipient ${pmMint}; eth_call transfer(PM, 1) ${transferToPm}`);
if (pmRecipient || pmMint || !transferToPm.startsWith("reverted")) throw new Error("X5 live check failed");

// ── 4. a squatter pre-initialises tier 0 at 1,000 coin/pathUSD and parks 50 pathUSD above it ───────────────────────
const key0 = memePoolKey(token, 10_000, 200);
const low = sqrtPriceX96For(1000n, 1n);
const posm = parseAbi(["function initializePool((address,address,uint24,int24,address),uint160) returns (int24)", "function modifyLiquidities(bytes,uint256)"]);
const tickOf = (sqrt: bigint) => Math.floor(Math.log(Number(sqrt) / Number(Q96)) * 2 / Math.log(1.0001));
const sqrtAt = (tick: number) => BigInt(Math.floor(Math.sqrt(1.0001 ** tick) * 2 ** 48)) * (1n << 48n);
const target = v4SqrtPrice((await readMemeLaunch(client, a, token, await now())).config.sqrtEndX96);
const lower = (Math.floor(tickOf(low) / 200) + 1) * 200;
const upper = (Math.floor(tickOf(target) / 200) - 1) * 200;
const squat = 50_000_000n;
const [sa, sb] = [sqrtAt(lower), sqrtAt(upper)];
const liq = ((squat * sa) / Q96) * sb / (sb - sa) * 99n / 100n;
const deadline = (await now()) + 300n;
const permit2 = parseAbi(["function approve(address,address,uint160,uint48)"]);
send("squat: init tier-0 + 50 pathUSD", [
  { to: v4.positionManager, data: encodeFunctionData({ abi: posm, functionName: "initializePool", args: [[key0.currency0, key0.currency1, key0.fee, key0.tickSpacing, key0.hooks], low] }) },
  { to: PATH_USD, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [v4.permit2, squat] }) },
  { to: v4.permit2, data: encodeFunctionData({ abi: permit2, functionName: "approve", args: [PATH_USD, v4.positionManager, squat, Number(deadline)] }) },
  { to: v4.positionManager, data: encodeFunctionData({ abi: posm, functionName: "modifyLiquidities", args: [actionsAndParams([[0x02, mintPosition({ poolKey: key0, tickLower: lower, tickUpper: upper, liquidity: liq, amount0Max: squat, amount1Max: 0n, owner: me })], [0x0d, settlePair(key0.currency0, key0.currency1)]]), deadline] }) },
]);

// ── 5. trading: one buy inside the anti-snipe window, then after it; a sell; the completing buy ────────────────────
let m = await readMemeLaunch(client, a, token, await now());
const early = quoteMemeBuy(m, 20_000_000n);
console.log(`anti-snipe fee now ${m.feeBpsNow} bps; 20 pathUSD buys ${early.coinOut} coin (fee ${early.fee})`);
send("buy (anti-snipe window)", buildBuy({ launchpad: a.launchpad, token, quoteIn: 20_000_000n, minCoinOut: withSlippage(early.coinOut, 100) }));
const wait = Number(m.createdAtSec + 110n - (await now()));
if (wait > 0) await sleep(wait * 1000);
m = await readMemeLaunch(client, a, token, await now());
const mid = quoteMemeBuy(m, 1_500_000_000n);
send("buy 1,500 (base fee)", buildBuy({ launchpad: a.launchpad, token, quoteIn: 1_500_000_000n, minCoinOut: withSlippage(mid.coinOut, 100) }));
m = await readMemeLaunch(client, a, token, await now());
const held = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [me] });
const s = quoteMemeSell(m, held / 4n);
send("sell 1/4", buildSell({ launchpad: a.launchpad, token, coinIn: held / 4n, minQuoteOut: withSlippage(s.quoteOut, 100) }));
m = await readMemeLaunch(client, a, token, await now());
const fin = quoteMemeBuy(m, 6_000_000_000n);
console.log(`final buy completes: ${fin.completes}, pays ${fin.quotePaid} of 6,000 pathUSD`);
send("buy → Complete (clipped)", buildBuy({ launchpad: a.launchpad, token, quoteIn: 6_000_000_000n, minCoinOut: withSlippage(fin.coinOut, 100) }));
m = await readMemeLaunch(client, a, token, await now());
console.log(`stage ${m.stage}, reserve ${m.quoteReserve}, progress ${m.progressBps} bps`);
if (m.stage !== "complete") throw new Error("launch did not complete");

// ── 6. the launch keeper's pass graduates it (cast sender, this lane's key) ────────────────────────────────────────
const pass = launchKeeperPass({
  deps: keeperDeps(client, a, me),
  launchpad: a.launchpad,
  dryRun: false,
  sender: { account: me, send: async (calls) => { const r = send("keeper: graduate", calls); return { hash: r.transactionHash, status: r.status === "0x1" ? "success" : "reverted" }; } },
});
const kept = await pass();
console.log(`keeper: ${kept.why}`);
m = await readMemeLaunch(client, a, token, await now());
if (m.stage !== "graduated" || !m.pool) throw new Error("not graduated");
console.log(`graduated: tier ${m.graduation!.tier}, position ${m.graduation!.positionId}, liquidity ${m.graduation!.liquidity}, pool ${m.pool.id}`);

// ── 7. a swap in the graduated pool through the pinned UR, then the locker and launchpad claims ────────────────────
send("UR swap 100 pathUSD → coin", buildPoolSwap({ chainId: 42431, key: m.pool.key, buyCoin: true, amountIn: 100_000_000n, amountOutMinimum: 1n, nowSec: await now() }));
send("locker.claimFees", [buildLockerClaimFees(a.locker, token)]);
send("locker.withdraw creator unlocked", [buildLockerWithdraw(a.locker, token, Bucket.CreatorUnlocked)]);
send("launchpad.claimFees", [buildClaimFees(a.launchpad)]);
send("launchpad.claimLeftover", [buildClaimLeftover(a.launchpad, token)]);

console.log("\nsummary");
for (const r of log) console.log(`| ${r.step} | \`${r.hash}\` | ${r.block} | ${r.gas} | ${r.status} |`);
console.log(`token ${token}: gate pass`);
