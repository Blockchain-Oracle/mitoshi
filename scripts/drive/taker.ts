#!/usr/bin/env -S pnpm exec tsx
/**
 * S3 soak taker: real house-key trades against the seed maker's quotes, so the soak exercises fills, settlement and the
 * settler's auto-pay (`redeemFor` after the 300 s claim grace) with our own testnet keys (disclosed as house activity,
 * never counted as users). For each trading Window of the named lanes it takes the best ask with an IOC BUY_YES (or the
 * best bid with BUY_NO on odd runs). Sends via `cast` (write-boundary); keys never printed.
 *
 *   pnpm --dir scripts exec tsx drive/taker.ts [--lanes BTC-5m,ETH-5m] [--lots 1000] [--role keeper]
 */
import { createPublicClient, encodeFunctionData, getAddress, http, type Hex } from "viem";
import { tempoModerato } from "viem/chains";
import { deployments } from "@cwf/clients";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { castSend } from "../lib/cast.js";

const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1]! : fallback);
const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const LANES = arg("--lanes", "BTC-5m,ETH-5m,SOL-5m").split(",");
const LOTS = BigInt(arg("--lots", "1000"));
const ROLE = arg("--role", "keeper");
const client = createPublicClient({ chain: tempoModerato, transport: http(RPC) });
const venue = (deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }>; params: Record<string, string> }>>)["42431"]!.engine!;
const ENGINE = getAddress(venue.contracts.EventsEngine!.address);
const LENS = getAddress(venue.contracts.EngineLens!.address);

async function main() {
  const now = Number((await client.getBlock()).timestamp);
  for (const [i, lane] of LANES.entries()) {
    const sid = venue.params[`series.${lane}`] as Hex | undefined;
    if (!sid) throw new Error(`no Series ${lane} in the fragment`);
    const s = (await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "seriesOf", args: [sid] })) as { nextIndex: bigint };
    const m = (await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "marketIdOf", args: [sid, s.nextIndex - 1n] })) as Hex;
    const ref = (await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "marketRef", args: [m] })) as { tradingStart: number; lockAt: number; openE8: bigint };
    const top = (await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "topOfBook", args: [m] })) as { bidTicks: number; askTicks: number };
    let target = m;
    let r = ref;
    let t = top;
    if (!(r.tradingStart <= now && now < r.lockAt - 45) || r.openE8 === 0n) {
      // The newest Window is not trading yet: take the one before it.
      target = (await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "marketIdOf", args: [sid, s.nextIndex - 2n] })) as Hex;
      r = (await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "marketRef", args: [target] })) as typeof ref;
      t = (await client.readContract({ address: LENS, abi: engineLensAbi, functionName: "topOfBook", args: [target] })) as typeof top;
      if (!(r.tradingStart <= now && now < r.lockAt - 45) || r.openE8 === 0n) {
        console.log(JSON.stringify({ lane, skipped: "no trading Window with an open print" }));
        continue;
      }
    }
    const buyYes = i % 2 === 0 ? t.askTicks > 0 : t.bidTicks === 0;
    const kind = buyYes ? 0 : 2;
    const price = buyYes ? t.askTicks : t.bidTicks;
    if (!price) {
      console.log(JSON.stringify({ lane, skipped: "empty book" }));
      continue;
    }
    const data = encodeFunctionData({ abi: eventsEngineAbi, functionName: "placeOrder", args: [{ marketId: target, kind, orderType: 2, selfMatch: 0, priceTicks: price, lots: LOTS, expireTs: r.lockAt, maxFills: 16, maxEvictions: 16, useCredit: false, withdrawProceeds: false, clientId: 0n }] });
    const rc = castSend([ENGINE, data], { signer: { role: ROLE }, rpc: RPC });
    console.log(JSON.stringify({ lane, market: target, side: buyYes ? "BUY_YES" : "BUY_NO", price, lots: String(LOTS), tx: rc.transactionHash, block: Number(rc.blockNumber), status: rc.status }));
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exitCode = 1;
});
