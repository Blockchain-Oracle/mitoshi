/**
 * D-231 ship step: republish the three themes as `basket` strategies on the live StrategyRegistry, from the themes'
 * creator `deployer-themes` (0xb0A5…8D6, the owner of ERC-8004 agent #82), run by the house strategy-runner — with the
 * exact call the app's studio sends (`encodeStrategyIntent` `strategy-publish`, self-paid). The specs are the shared
 * vectors (`@cwf/core/strategies/basket.vectors.json`): Builders' Stack without NFLX, Chips & Clouds, and Around the
 * Clock on 24/7-capable names only (AMD and PLTR have no RedStone 24/7 feed).
 *
 *   tsx scripts/drive/themes-baskets.ts            simulate each publish from 0xb0A5 (eth_call) and print the plan
 *   tsx scripts/drive/themes-baskets.ts --send     send them (one tx each), skipping a theme already on the registry
 *   … --rpc <url>                                  against another endpoint (an anvil fork of Moderato for a rehearsal)
 *   … --print                                      also print each call's target and calldata
 *
 * Run it after the web and ops that read baskets are live: an older app shows an unreadable strategy until then.
 */
import { decodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { isBasket, parseStrategyMetadata, type BasketSpec, type StrategyIntent, type TxIntent } from "@cwf/core";
import vectors from "@cwf/core/strategies/basket.vectors.json";
import { tempoReadClient } from "@cwf/markets";
import { basketAgentOf, encodeStrategyIntent, specHashOf, strategyVenueOf, toStrategyRecord, type StrategyTuple } from "@cwf/markets/strategies";
import { castBatch } from "../lib/cast";
import { loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const send = argv.includes("--send");
const rpc = argv.includes("--rpc") ? argv[argv.indexOf("--rpc") + 1]! : (process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz");
const CHAIN_ID = 42431;
const creator = getAddress(loadRole("deployer-themes").address);
const runner = getAddress(loadRole("strategy-runner").address);
const agent = basketAgentOf(CHAIN_ID)!;
const venue = strategyVenueOf(CHAIN_ID)!;
const client = tempoReadClient("testnet", rpc);
const registry = { address: venue.strategyRegistry, abi: strategyRegistryAbi } as const;

/** Each theme's one line; the spec, its bytes and hash are the vectors'. */
const BLURBS: Record<string, string> = {
  "Builders' Stack": "Cars and data, riding the move.",
  "Chips & Clouds": "Chips, cloud and data, fading the stretch.",
  "Around the Clock": "Three names with a 24/7 feed, read day and night.",
};

if (agent.owner.toLowerCase() !== creator.toLowerCase()) throw new Error(`agent #${agent.agentId} is owned by ${agent.owner}, not ${creator}`);
console.log(`registry ${venue.strategyRegistry} · creator ${creator} · runner ${runner} · agent #${agent.agentId} · ${send ? "SEND" : "simulate"} on ${rpc}`);

// A theme this creator already published with the same spec hash is skipped, so a re-run publishes nothing twice.
const count = Number(await client.readContract({ ...registry, functionName: "strategyCount" }));
const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
const reads = (await client.multicall({ allowFailure: false, contracts: ids.flatMap((id) => [{ ...registry, functionName: "strategyOf" as const, args: [id] as const }, { ...registry, functionName: "metadataOf" as const, args: [id] as const }]) })) as unknown[];
const published = new Set(
  ids.flatMap((id, i) => {
    const r = toStrategyRecord(id, reads[2 * i] as StrategyTuple, reads[2 * i + 1] as Hex);
    const meta = r.metadata ? parseStrategyMetadata(r.metadata) : null;
    return r.creator.toLowerCase() === creator.toLowerCase() && meta && isBasket(meta.spec) ? [r.specHash.toLowerCase()] : [];
  }),
);

for (const t of vectors.themes) {
  const spec = t.spec as BasketSpec;
  if (specHashOf(spec) !== t.specHash) throw new Error(`${t.name}: spec hash ${specHashOf(spec)} ≠ vector ${t.specHash}`);
  const lanes = spec.lanes === "both" ? 2 : 1;
  const intent: StrategyIntent = {
    kind: "strategy-publish", runner, spec, agentId: agent.agentId, feeBase: 0n,
    metadata: { name: t.name, description: BLURBS[t.name] ?? "", spec },
    envelope: { maxStakePerTradeBase: 5_000_000n, maxDailySpendBase: 50_000_000n, maxOpenPositions: Math.min(10, spec.members.length * lanes), maxPriceRaw: 850_000n, series: null },
  };
  const e = encodeStrategyIntent(intent as TxIntent, { chainId: CHAIN_ID, wallet: creator });
  if (!e?.ok) throw new Error(`${t.name}: not encoded: ${e ? e.diagnosis.technical : "unclaimed"}`);
  const call = e.value.calls[0] as { to: Address; data: Hex };
  const label = `${t.name} (${spec.members.map((m) => `${m.symbol} ${m.weightBps / 100}%`).join(", ")}; ${spec.lanes}; ${spec.rule.preset})`;
  if (published.has(t.specHash.toLowerCase())) {
    console.log(`skip  ${label}: already published by ${creator}`);
    continue;
  }
  const { args } = decodeFunctionData({ abi: strategyRegistryAbi, data: call.data });
  const sim = await client.simulateContract({ ...registry, account: creator, functionName: "publish", args: args as never });
  console.log(`ok    ${label}: would be strategy #${String(sim.result)} · spec ${t.specHash}`);
  if (argv.includes("--print")) console.log(`call  ${call.to} ${call.data}`);
  if (!send) continue;
  const r = castBatch([call], { signer: { role: "deployer-themes" }, rpc });
  console.log(`sent  ${t.name}: tx ${r.transactionHash} block ${BigInt(r.blockNumber)} status ${r.status} gas ${BigInt(r.gasUsed)}`);
  if (r.status !== "0x1") throw new Error(`${t.name}: publish reverted`);
}
process.exit(0);
