/**
 * R4-5 live drive on Moderato (D-227): a real Range round on the redeployed RangeReserve, on any lane — a stock, a
 * 15m or 1h Window — priced on the FairValueGuard's σ for the Window's Series (`RangePricing._sigma`).
 *
 *   opener  funded from the `deployer-tickets` role, then `[approve(reserve, maxStake), openRange(…, signed spot)]` —
 *           one atomic batch, the spot a real RedStone "latest" payload for the ticker's guard feed
 *   band    inside, centred on the signed spot, widened or narrowed until the reserve prices it (2 %–97 %)
 *
 *   RANGE_DRIVE_DIR=<dir outside the repo> pnpm --dir scripts exec tsx drive/range-live.ts <SYMBOL/lane/NNm> [...]
 * e.g. `TSLA/stock24/60m NVDA/stock24/15m`. Throwaway keys live in RANGE_DRIVE_DIR (0600, never printed); every tx is
 * receipt-checked; prints the round as the chain reads it back.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BaseError, ContractFunctionRevertedError, createPublicClient, encodeFunctionData, erc20Abi, getAddress, http, parseEventLogs, type Address, type Hex } from "viem";
import { tempoModerato } from "viem/chains";
import { deployments } from "@cwf/clients";
import { rangeReserveAbi } from "@cwf/clients/abis/RangeReserve";
import guardSpec from "../../packages/core/src/fair/guard-spec.json" with { type: "json" };
import { PATH_USD, castBatch, castSend } from "../lib/cast.js";
import { label, liveWindows, testnetVenue } from "./lib/live-windows.js";
import { latestSpot } from "./lib/spot.js";

const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const client = createPublicClient({ chain: tempoModerato, transport: http(RPC) });
const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
const RESERVE = getAddress(d["42431"]!.range!.contracts.RangeReserve!.address);
const ONE = 1_000_000n;
const PAYOUT = 5n * ONE;

const dir = process.env.RANGE_DRIVE_DIR;
if (!dir) throw new Error("set RANGE_DRIVE_DIR (outside the repo) for the throwaway key files");
mkdirSync(dir, { recursive: true });
const log = (step: string, o: Record<string, unknown> = {}) => console.log(JSON.stringify({ step, atUtc: new Date().toISOString(), ...o }, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const enc = (abi: readonly unknown[], fn: string, args: unknown[]): Hex => (encodeFunctionData as (x: unknown) => Hex)({ abi, functionName: fn, args });
const reason = (e: unknown) => {
  const rev = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
  return rev instanceof ContractFunctionRevertedError ? `${rev.data?.errorName ?? "revert"}(${(rev.data?.args ?? []).join(",")})` : String(e).slice(0, 160);
};

function wallet(name: string): { walletFile: string; address: Address } {
  const file = join(dir!, `${name}.json`);
  if (!existsSync(file)) {
    writeFileSync(file, execFileSync("cast", ["wallet", "new", "--json"]).toString());
    chmodSync(file, 0o600);
  }
  return { walletFile: file, address: getAddress((JSON.parse(readFileSync(file, "utf8")) as { data: { address: string }[] }).data[0]!.address) };
}

async function preview(marketId: Hex, asset: string, low: bigint, high: bigint) {
  return client.readContract({ address: RESERVE, abi: rangeReserveAbi, functionName: "previewOpen", args: [marketId, asset, 0, low, high, PAYOUT] }).then(
    (r) => ({ ok: true as const, stake: r[0], probRaw: r[1], sigmaE8: r[3].sigmaE8 }),
    (e: unknown) => ({ ok: false as const, why: reason(e) }),
  );
}

async function openOn(key: string, opener: { walletFile: string; address: Address }) {
  const { client: ops, venue } = testnetVenue();
  for (let attempt = 0; attempt < 12; attempt++) {
    const nowSec = Math.floor(Date.now() / 1000);
    const w = (await liveWindows(ops, venue, nowSec)).find((x) => label(x).startsWith(`${key}#`));
    if (!w || w.market.lockAtSec - nowSec < 120) {
      log("waiting for the Window", { key, found: w ? label(w) : null });
      await sleep(15_000);
      continue;
    }
    const asset = w.series.symbol;
    const feed = (guardSpec.spotFeeds as Record<string, string>)[asset]!;
    const spot = await latestSpot(feed);
    const spotCents = spot.medianE8 / 1_000_000n;
    // Inside, centred on the signed spot: start at ±0.4 % and step until the reserve prices it (2 %–97 %).
    let half = (spotCents * 4n) / 1_000n;
    let priced: Awaited<ReturnType<typeof preview>> | null = null;
    for (let i = 0; i < 8; i++) {
      priced = await preview(w.market.marketId, asset, spotCents - half, spotCents + half);
      if (priced.ok) break;
      if (priced.why.startsWith("NearCertain")) half = (half * 2n) / 3n;
      else if (priced.why.startsWith("LongShot")) half = (half * 3n) / 2n;
      else break;
    }
    if (!priced?.ok) {
      log("not priceable yet", { window: label(w), why: priced?.why });
      await sleep(15_000);
      continue;
    }
    const low = spotCents - half;
    const high = spotCents + half;
    const maxStake = (priced.stake * 103n) / 100n;
    const data = enc(rangeReserveAbi, "openRange", [w.market.marketId, asset, 0, low, high, PAYOUT, maxStake, spot.payload]);
    const r = castBatch([{ to: PATH_USD, data: enc(erc20Abi, "approve", [RESERVE, maxStake]) }, { to: RESERVE, data }], { signer: { walletFile: opener.walletFile }, rpc: RPC });
    if (r.status !== "0x1" && r.status !== "1") throw new Error(`openRange reverted: ${r.transactionHash}`);
    const receipt = await client.getTransactionReceipt({ hash: r.transactionHash });
    const opened = parseEventLogs({ abi: rangeReserveAbi, eventName: "RangeOpened", logs: receipt.logs })[0]!;
    const round = await client.readContract({ address: RESERVE, abi: rangeReserveAbi, functionName: "roundOf", args: [opened.args.roundId] });
    const basis = await client.readContract({ address: RESERVE, abi: rangeReserveAbi, functionName: "basisOf", args: [opened.args.roundId] });
    log("openRange", { window: label(w), marketId: w.market.marketId, tx: r.transactionHash, block: Number(r.blockNumber), roundId: opened.args.roundId, band: [low, high], spotCents, spotSigners: spot.signers, stake: round.stake, maxPayout: round.maxPayout, probRaw: round.probRaw, sigmaE8: basis.sigmaE8, centerQE6: basis.centerQE6, driftE4: basis.driftE4, expirySec: round.expirySec });
    return;
  }
  throw new Error(`${key}: no priceable Window within three minutes`);
}

const keys = process.argv.slice(2);
if (keys.length === 0) throw new Error("name at least one lane, e.g. TSLA/stock24/60m");
const opener = wallet("range-opener");
const balance = await client.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [opener.address] });
if (balance < 10n * ONE) {
  const r = castSend([PATH_USD, "transfer(address,uint256)", opener.address, String(20n * ONE)], { signer: { role: "deployer-tickets" }, rpc: RPC });
  log("fund opener $20 from deployer-tickets", { opener: opener.address, tx: r.transactionHash, block: Number(r.blockNumber) });
}
for (const key of keys) await openOn(key, opener);
