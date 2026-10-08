/**
 * S10a live drive on Moderato: the ParlayReserve against the S8 maker vault's depth with real RedStone spot payloads.
 *
 *   house     approve + supply to the reserve (self-paid capital intake; `supply` is never sponsored, D-166)
 *   supplier  approve + supply to the S8 MarketMakerVault (its capital, so it can quote 20 a side)
 *   maker     (deployer-maker, the vault's maker) `vault.quote` on every crypto 5-minute Window with an open print,
 *             centred on the FairValueGuard's model at the latest signed spot — the S8 depth the legs are priced over
 *   (eth_call) the honest refusals: `ThinBook` for a payout past the rested depth; `BelowFairValue` when a leg's book
 *             has fallen under the model (PD-2) — both by name, nothing sent
 *   opener    `[approve(reserve, maxStake), openParlay(legs, payout, maxStake, spotProofs)]` with one signed RedStone
 *             "latest" payload per leg (the browser path is `web/e2e/parlay.ts`, sponsored through the relay)
 *   anyone    `resolveLeg` in close order once S3 settles each Window (D-108), then `claim` if every leg landed
 *
 *   open-all  one leg pair, a ticket on every side pair the reserve accepts — one of them lands, so a claim follows
 *   PARLAY_DRIVE_DIR=<dir outside the repo> pnpm --dir scripts exec tsx drive/parlay-live.ts <maker|open|open-all|settle|refusals>
 * Throwaway keys live in PARLAY_DRIVE_DIR (0600, never printed); every tx line is `cast receipt`-checked by `send`.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BaseError, ContractFunctionRevertedError, createPublicClient, encodeFunctionData, erc20Abi, getAddress, http, type Address, type Hex } from "viem";
import { tempoModerato } from "viem/chains";
import { deployments } from "@cwf/clients";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";
import { marketMakerVaultAbi } from "@cwf/clients/abis/MarketMakerVault";
import { parlayReserveAbi } from "@cwf/clients/abis/ParlayReserve";
import { redStonePrintVerifierAbi } from "@cwf/clients/abis/RedStonePrintVerifier";
import { PATH_USD, castBatch, castSend, type Signer } from "../lib/cast.js";
import { latestSpot } from "./lib/spot.js";

const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const client = createPublicClient({ chain: tempoModerato, transport: http(RPC) });
const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
const LENS = getAddress(d["42431"]!.engine!.contracts.EngineLens!.address);
const GUARD = getAddress(d["42431"]!.fair!.contracts.FairValueGuard!.address);
const VAULT = getAddress(d["42431"]!.maker!.contracts.MarketMakerVault!.address);
const RESERVE = getAddress(d["42431"]!.parlay!.contracts.ParlayReserve!.address);
const FEEDS: Record<number, string> = { 101: "BTC", 102: "ETH", 103: "SOL" };
const ONE = 1_000_000n;
const QTY = 20n * ONE;
const HALF_SPREAD_TICKS = 15;
const READ_ABI = [...parlayReserveAbi, ...fairValueGuardAbi.filter((e) => e.type === "error"), ...redStonePrintVerifierAbi.filter((e) => e.type === "error")] as const;

const dir = process.env.PARLAY_DRIVE_DIR;
if (!dir) throw new Error("set PARLAY_DRIVE_DIR (outside the repo) for the throwaway key files");
mkdirSync(dir, { recursive: true });
const log = (step: string, o: Record<string, unknown> = {}) => console.log(JSON.stringify({ step, atUtc: new Date().toISOString(), ...o }, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);

function wallet(name: string): { signer: Signer; address: Address } {
  const file = join(dir!, `${name}.json`);
  if (!existsSync(file)) {
    writeFileSync(file, execFileSync("cast", ["wallet", "new", "--json"]).toString());
    chmodSync(file, 0o600);
  }
  return { signer: { walletFile: file }, address: getAddress((JSON.parse(readFileSync(file, "utf8")) as { data: { address: string }[] }).data[0]!.address) };
}
const bal = (a: Address) => client.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [a] });
async function fund(a: Address) {
  if ((await bal(a)) > 2_000n * ONE) return;
  execFileSync("cast", ["rpc", "tempo_fundAddress", a, "--rpc-url", RPC], { stdio: "ignore" });
  for (let i = 0; i < 30; i++, await sleep(1000)) if ((await bal(a)) > 0n) return;
  throw new Error(`funding ${a} did not land`);
}
function ok(r: { status: string; transactionHash: Hex; blockNumber: string; gasUsed: string }, step: string, extra: Record<string, unknown> = {}) {
  if (r.status !== "0x1" && r.status !== "1" && r.status !== "success") throw new Error(`${step} reverted: ${r.transactionHash}`);
  log(step, { tx: r.transactionHash, block: Number(r.blockNumber), gasUsed: Number(r.gasUsed), ...extra });
  return r;
}
const enc = (abi: readonly unknown[], fn: string, args: unknown[]): Hex => (encodeFunctionData as (x: unknown) => Hex)({ abi, functionName: fn, args });
const approve = (spender: Address, amount: bigint) => ({ to: PATH_USD, data: enc(erc20Abi, "approve", [spender, amount]) });
const lens = (fn: string, args: unknown[]) => client.readContract({ address: LENS, abi: engineLensAbi, functionName: fn as never, args: args as never }) as Promise<any>;
const reserve = (fn: string, args: unknown[] = []) => client.readContract({ address: RESERVE, abi: parlayReserveAbi, functionName: fn as never, args: args as never }) as Promise<any>;
const vault = (fn: string, args: unknown[] = []) => client.readContract({ address: VAULT, abi: marketMakerVaultAbi, functionName: fn as never, args: args as never }) as Promise<any>;
const reason = (e: unknown) => {
  const rev = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
  if (!(rev instanceof ContractFunctionRevertedError)) return String(e).slice(0, 200);
  // An error outside the ABI (a token precompile, the engine) still names its selector and raw data.
  return rev.data?.errorName ? `${rev.data.errorName}(${(rev.data.args ?? []).join(", ")})` : `unknown ${rev.signature ?? ""} ${rev.raw ?? ""}`.trim();
};

interface Live { m: Hex; ticker: number; feed: string; lockAt: number; expiry: number; openE8: bigint }
/** Crypto 5-minute Windows the S3 roller listed: Trading, open print recorded, `minLeftSec` before lock. */
async function liveCrypto(minLeftSec: number): Promise<Live[]> {
  const cfg = await lens("config", []);
  const out: Live[] = [];
  for (let i = cfg.nextMIdx; i > 0 && i > cfg.nextMIdx - 40; i--) {
    const m = (await lens("marketIdAt", [i])) as Hex;
    const r = await lens("marketRef", [m]);
    if (FEEDS[r.ticker] && r.status === 1 && r.openE8 > 0n && Number(r.lockAt) - nowSec() >= minLeftSec) out.push({ m, ticker: r.ticker, feed: FEEDS[r.ticker]!, lockAt: Number(r.lockAt), expiry: Number(r.expiry), openE8: r.openE8 });
  }
  return out;
}
const fairUp = async (w: Live) => {
  const spot = await latestSpot(w.feed);
  const up = (await client.readContract({ address: GUARD, abi: fairValueGuardAbi, functionName: "previewFairUpE6", args: [w.m, spot.medianE8] })) as bigint;
  return { up, spot };
};

const house = wallet("parlay-house");
const supplier = wallet("vault-supplier");
const opener = wallet("parlay-opener");
const maker = { signer: { role: "deployer-maker" } as Signer, address: getAddress("0xE41f5FEb2bc3040B82bA22dc6F62b824037e1A8d") };

async function setup() {
  for (const w of [house, supplier, opener]) await fund(w.address);
  log("accounts", { reserve: RESERVE, vault: VAULT, house: house.address, supplier: supplier.address, opener: opener.address, maker: maker.address });
  if (((await reserve("liquid")) as bigint) < 500n * ONE) {
    ok(castBatch([approve(RESERVE, 1_000n * ONE), { to: RESERVE, data: enc(parlayReserveAbi, "supply", [1_000n * ONE]) }], { signer: house.signer, rpc: RPC }), "house supply 1,000 to the parlay reserve (self-paid)");
  }
  // The other two reserves the gate opens against get the same house capital (self-paid; `supply` is never sponsored).
  const LIQ = [{ type: "function", name: "liquid", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const;
  const SUP = [{ type: "function", name: "supply", stateMutability: "nonpayable", inputs: [{ type: "uint256", name: "amount" }], outputs: [{ type: "uint256" }] }] as const;
  for (const [area, name] of [["range", "RangeReserve"], ["leverage", "LeverageReserve"]] as const) {
    const at = getAddress(d["42431"]![area]!.contracts[name]!.address);
    if (((await client.readContract({ address: at, abi: LIQ, functionName: "liquid" })) as bigint) >= 500n * ONE) continue;
    ok(castBatch([approve(at, 1_000n * ONE), { to: at, data: enc(SUP, "supply", [1_000n * ONE]) }], { signer: house.signer, rpc: RPC }), `house supply 1,000 to the ${area} reserve (self-paid)`);
  }
  if (((await vault("liquid")) as bigint) < 150n * ONE) {
    ok(castBatch([approve(VAULT, 300n * ONE), { to: VAULT, data: enc(marketMakerVaultAbi, "supply", [300n * ONE]) }], { signer: supplier.signer, rpc: RPC }), "supplier supply 300 to the S8 maker vault (self-paid)");
  }
  log("sheets", { reserveLiquid: await reserve("liquid"), reserveLocked: await reserve("locked"), vaultLiquid: await vault("liquid"), vaultTotal: await vault("totalValue") });
}

/** The vault's quote centred on the model, never crossing what already rests (PostOnly), inside its 0.05–0.95 band. */
async function quoteWindow(w: Live) {
  const { up, spot } = await fairUp(w);
  const mid = Math.round(Number(up) / 1000);
  let bid = Math.max(50, mid - HALF_SPREAD_TICKS);
  let ask = Math.min(950, mid + HALF_SPREAD_TICKS);
  const [bids, asks] = await Promise.all([lens("levels", [w.m, true, 1n, 0, 512n]), lens("levels", [w.m, false, 1n, 0, 512n])]);
  const bestBid = Number(bids[0][0] ?? 0);
  const bestAsk = Number(asks[0][0] ?? 0);
  if (bestAsk > 0 && bid >= bestAsk) bid = bestAsk - 1;
  if (bestBid > 0 && ask <= bestBid) ask = bestBid + 1;
  if (ask - bid < 20) return log("maker skip (spread under the vault's 0.02 floor)", { m: w.m, bid, ask, bestBid, bestAsk });
  const r = castSend([VAULT, enc(marketMakerVaultAbi, "quote", [w.m, BigInt(bid) * 1000n, BigInt(ask) * 1000n, QTY, BigInt(w.lockAt) * 1_000_000_000n])], { signer: maker.signer, rpc: RPC });
  ok(r, "maker vault.quote (S8 depth, 20 a side)", { m: w.m, feed: w.feed, fairUpE6: up, spotE8: spot.medianE8, bidTicks: bid, askTicks: ask });
}

/** The vault's closed Windows settle for anyone (pull + one full redeem into the vault), freeing its Window slots. */
async function settleVault() {
  for (const m of (await vault("openWindows")) as Hex[]) {
    const r = await lens("marketRef", [m]);
    if (r.status !== 4 && r.status !== 5) continue;
    await Promise.resolve()
      .then(() => ok(castSend([VAULT, enc(marketMakerVaultAbi, "settle", [m])], { signer: supplier.signer, rpc: RPC }), "anyone vault.settle (a closed Window)", { m, status: r.status }))
      .catch((e) => log("vault settle error", { m, why: String(e).slice(0, 200) }));
  }
}

async function makerLoop() {
  await setup();
  const quoted = new Set<string>();
  for (;;) {
    try {
      await settleVault();
      for (const w of await liveCrypto(150)) {
        if (quoted.has(w.m)) continue;
        quoted.add(w.m);
        await quoteWindow(w).catch((e) => log("maker error", { m: w.m, why: reason(e) }));
      }
    } catch (e) {
      log("loop error", { why: String(e).slice(0, 160) });
    }
    await sleep(10_000);
  }
}

/** Two legs on distinct Windows the vault quoted, each on the side the book prices at or above the model. */
async function pickLegs(): Promise<{ legs: { marketId: Hex; outcomeIdx: number }[]; spots: Hex[]; fair: bigint[] }> {
  for (;;) {
    const live = await liveCrypto(60);
    const quotedLive: Live[] = [];
    for (const w of live) if (((await lens("openOrdersOf", [w.m, VAULT])) as unknown[]).length > 0) quotedLive.push(w);
    if (quotedLive.length >= 2) {
      const picked = quotedLive.slice(0, 2);
      const fairs = await Promise.all(picked.map(fairUp));
      const legs = picked.map((w, i) => ({ marketId: w.m, outcomeIdx: fairs[i]!.up >= 500_000n ? 0 : 1 }));
      return { legs, spots: fairs.map((f) => f.spot.payload), fair: fairs.map((f) => f.up) };
    }
    log("waiting for two quoted Windows with an open print", { quoted: quotedLive.length });
    await sleep(10_000);
  }
}

async function openOnce() {
  await setup();
  const payout = 20n * ONE;
  const slack = ((await reserve("params")) as readonly unknown[])[9] as bigint;
  let chosen: { legs: { marketId: Hex; outcomeIdx: number }[]; spots: Hex[]; fair: bigint[]; preview: [bigint, bigint, bigint[]] } | null = null;
  for (let i = 0; i < 12 && !chosen; i++) {
    const picked = await pickLegs();
    // The four side pairs: the first the book prices at or above the model on both legs (what the reserve accepts).
    for (const sides of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const legs = picked.legs.map((l, k) => ({ ...l, outcomeIdx: sides[k]! }));
      const pv = await client.readContract({ address: RESERVE, abi: READ_ABI, functionName: "previewOpen", args: [legs, payout] }).then((r) => r as unknown as [bigint, bigint, bigint[]], (e) => {
        log("not priceable yet (the vault's quotes rest 20 s first, D-109)", { reason: reason(e) });
        return null;
      });
      if (!pv) break;
      const fairSide = legs.map((l, k) => (l.outcomeIdx === 0 ? picked.fair[k]! : 1_000_000n - picked.fair[k]!));
      if (pv[2].every((price, k) => price + slack >= fairSide[k]!)) {
        chosen = { legs, spots: picked.spots, fair: fairSide, preview: pv };
        break;
      }
      log("side pair under the model, trying another", { sides, prices: pv[2], fairSide });
    }
    if (!chosen) await sleep(10_000);
  }
  if (!chosen) throw new Error("no priceable pair within two minutes");
  const { legs, spots, fair } = chosen;
  const [stake, combined, prices] = chosen.preview;
  log("previewOpen (the chain's price over rested depth)", { legs, stake, combined, prices, fairUpE6: fair });
  const maxStake = stake + stake / 100n;
  const data = enc(parlayReserveAbi, "openParlay", [legs, payout, maxStake, spots]);
  const r = castBatch([approve(RESERVE, maxStake), { to: RESERVE, data }], { signer: opener.signer, rpc: RPC });
  ok(r, "opener openParlay (2 legs, one signed RedStone spot each)", { payout, maxStake });
  const count = (await reserve("parlayCountOf", [opener.address])) as bigint;
  const ids = (await reserve("parlaysOf", [opener.address, 0n, 50n])) as bigint[];
  log("ticket", { count, id: ids.at(-1), parlay: await reserve("parlayOf", [ids.at(-1)]), legs: await reserve("legsOf", [ids.at(-1)]) });
}

/**
 * `open-all`: one leg pair, a ticket on every side pair the reserve accepts (the book at or above the model on both
 * legs). Exactly one of the four combinations lands when neither leg voids, so the run always has a winner to claim.
 */
async function openAllSides() {
  await setup();
  const payout = 20n * ONE;
  const picked = await pickLegs();
  for (const sides of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const legs = picked.legs.map((l, k) => ({ ...l, outcomeIdx: sides[k]! }));
    const pv = await client.readContract({ address: RESERVE, abi: READ_ABI, functionName: "previewOpen", args: [legs, payout] }).then((r) => r as unknown as [bigint, bigint, bigint[]], (e) => {
      log("side pair refused by the reserve", { sides, reason: reason(e) });
      return null;
    });
    if (!pv) continue;
    const maxStake = pv[0] + pv[0] / 100n;
    try {
      ok(castBatch([approve(RESERVE, maxStake), { to: RESERVE, data: enc(parlayReserveAbi, "openParlay", [legs, payout, maxStake, picked.spots]) }], { signer: opener.signer, rpc: RPC }), "opener openParlay (side pair)", { sides, stake: pv[0], maxStake });
    } catch (e) {
      log("side pair not opened", { sides, why: String(e).slice(0, 200) });
    }
  }
}

async function settleAll(owner: Address) {
  const ids = (await reserve("parlaysOf", [owner, 0n, 50n])) as bigint[];
  for (const id of ids) {
    for (;;) {
      const p = await reserve("parlayOf", [id]);
      if (p.status === 2 || p.status === 3 || p.status === 4) break;
      if (p.status === 1) {
        ok(castSend([RESERVE, enc(parlayReserveAbi, "claim", [id])], { signer: house.signer, rpc: RPC }), "anyone claim → the owner is paid", { id, payout: p.maxPayout, ownerBefore: await bal(owner) });
        log("owner after claim", { id, owner: await bal(owner) });
        break;
      }
      const next = Number(await reserve("nextLegOf", [id]));
      const legs = await reserve("legsOf", [id]);
      const r = await lens("marketRef", [legs[next].marketId]);
      if (r.status !== 4 && r.status !== 5) {
        log("waiting for S3 to settle the next leg's Window (D-108 order)", { id, leg: next, status: r.status, expiry: r.expiry });
        await sleep(20_000);
        continue;
      }
      for (let other = 0; other < legs.length; other++) {
        if (other === next || legs[other].status !== 0) continue;
        const o = await lens("marketRef", [legs[other].marketId]);
        if (o.status === 4 || o.status === 5) log("out-of-order leg refused (eth_call)", { id, leg: other, reason: await client.simulateContract({ account: house.address, address: RESERVE, abi: READ_ABI, functionName: "resolveLeg", args: [id, BigInt(other)] }).then(() => "accepted", reason) });
      }
      ok(castSend([RESERVE, enc(parlayReserveAbi, "resolveLeg", [id, BigInt(next)])], { signer: house.signer, rpc: RPC }), "anyone resolveLeg (the next leg in close order)", { id, leg: next, windowStatus: r.status, payoutYes: r.payoutYes, payoutNo: r.payoutNo });
      log("after", { lockedByExpiry: await reserve("lockedByExpiry", [BigInt(legs[next].expirySec)]), parlay: await reserve("parlayOf", [id]) });
    }
  }
}

async function refusals() {
  const { legs, spots } = await pickLegs();
  const thin = await client.readContract({ address: RESERVE, abi: READ_ABI, functionName: "previewOpen", args: [legs, 60n * ONE] }).then(() => "accepted", reason);
  log("thin book refused by name (payout 60 over 20 rested)", { reason: thin });
  const wrong = legs.map((l) => ({ ...l, outcomeIdx: 1 - l.outcomeIdx }));
  // The reserve pulls the stake before it prices the legs, so without an allowance the simulation stops at the token's
  // InsufficientAllowance and never reaches PD-2: approve first (self-paid), then ask.
  await setup();
  ok(castBatch([approve(RESERVE, 100n * ONE)], { signer: opener.signer, rpc: RPC }), "opener approve (so the PD-2 check is reached)", { amount: 100n * ONE });
  const pd2 = await client.simulateContract({ account: opener.address, address: RESERVE, abi: READ_ABI, functionName: "openParlay", args: [wrong, 20n * ONE, 100n * ONE, spots] }).then(() => "accepted", reason);
  log("the other sides, bounded by the model (PD-2) on the same spots", { reason: pd2 });
}

const mode = process.argv[2] ?? "maker";
if (mode === "maker") await makerLoop();
else if (mode === "open") await openOnce();
else if (mode === "open-all") await openAllSides();
else if (mode === "settle") await settleAll(getAddress(process.argv[3] ?? opener.address));
else if (mode === "refusals") await refusals();
else throw new Error(`unknown mode ${mode}`);
