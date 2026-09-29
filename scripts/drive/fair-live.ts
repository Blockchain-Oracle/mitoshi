/**
 * S10.0 live check on Moderato: the deployed FairValueGuard prices a live Window the S3 roller listed from a real
 * RedStone latest spot (eth_call — the guard is read inside the reserves' own transactions), beside the S3 house
 * maker's live quote on the same Window, and refuses a stale spot by name.
 *
 *   pnpm --dir scripts exec tsx drive/fair-live.ts
 */
import { BaseError, ContractFunctionRevertedError, createPublicClient, getAddress, http, type Hex } from "viem";
import { tempoModerato } from "viem/chains";
import { deployments } from "@cwf/clients";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";
import { redStonePrintVerifierAbi } from "@cwf/clients/abis/RedStonePrintVerifier";
import { latestSpot } from "./lib/spot.js";

const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const client = createPublicClient({ chain: tempoModerato, transport: http(RPC) });
const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
const LENS = getAddress(d["42431"]!.engine!.contracts.EngineLens!.address);
const GUARD = getAddress(d["42431"]!.fair!.contracts.FairValueGuard!.address);
const FEEDS: Record<number, string> = { 101: "BTC", 102: "ETH", 103: "SOL" };
const log = (step: string, o: Record<string, unknown>) => console.log(JSON.stringify({ step, ...o }, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const reason = (e: unknown) => {
  const rev = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
  return rev instanceof ContractFunctionRevertedError ? `${rev.data?.errorName}(${(rev.data?.args ?? []).join(", ")})` : String(e).slice(0, 200);
};

async function tradingWindows(): Promise<Hex[]> {
  const cfg = await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "config" });
  const now = BigInt(Math.floor(Date.now() / 1000));
  const out: Hex[] = [];
  for (let i = cfg.nextMIdx; i > 0 && i > cfg.nextMIdx - 30; i--) {
    const m = await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "marketIdAt", args: [i] });
    const r = await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "marketRef", args: [m] });
    if (FEEDS[r.ticker] && r.status === 1 && r.openE8 > 0n && BigInt(r.lockAt) - now >= 30n) out.push(m);
  }
  return out;
}

let ms = await tradingWindows();
for (let i = 0; ms.length === 0 && i < 40; i++, await sleep(10_000)) ms = await tradingWindows();
if (ms.length === 0) throw new Error("no live Window with an open print");
const feedOf = new Map<Hex, string>();
for (const m of ms) {
  const r = await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "marketRef", args: [m] });
  const feed = FEEDS[r.ticker]!;
  feedOf.set(m, feed);
  const spot = await latestSpot(feed);
  const top = await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "topOfBook", args: [m] });
  const { result } = await client.simulateContract({ address: GUARD, abi: fairValueGuardAbi, functionName: "fairUpE6", args: [m, spot.payload] });
  const now = Math.floor(Date.now() / 1000);
  log("fair value (eth_call guard.fairUpE6 with a real RedStone latest payload)", {
    marketId: m, feed, openE8: r.openE8, spotE8: result[1], gatewayMedianE8: spot.medianE8, signers: spot.signers, spotAgeSec: now - spot.tsSec,
    secondsLeft: r.expiry - now, sigmaE8: await client.readContract({ address: GUARD, abi: fairValueGuardAbi, functionName: "sigmaOf", args: [m] }),
    fairUpE6: result[0], houseBidTicks: top.bidTicks, houseAskTicks: top.askTicks,
  });
}
// A spot older than the guard's 120 s is refused by the verifier, by name.
const mStale = ms[0]!;
const stale = await latestSpot(feedOf.get(mStale)!);
await sleep(125_000);
try {
  // The verifier's errors bubble through the guard: decode with both ABIs.
  const abi = [...fairValueGuardAbi, ...redStonePrintVerifierAbi.filter((e) => e.type === "error")] as const;
  await client.simulateContract({ address: GUARD, abi, functionName: "fairUpE6", args: [mStale, stale.payload] });
  log("stale spot", { refused: false });
} catch (e) {
  log("stale spot refused (125 s old)", { reason: reason(e) });
}
