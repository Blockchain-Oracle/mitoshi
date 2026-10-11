/**
 * S9 house strategies on Moderato (L-51, AG-1, D-218.7): each is a real ERC-8004 agent owned by the `strategy-runner`
 * key and published on the StrategyRegistry with that agent id, `strategy-runner` as its runner (the self-hosted
 * runner, S9.5), free to copy. Per strategy: `register` (a self-contained data: URI, the id predicted) → `publish`
 * (agentId) → the `agent_registrations` row → `setAgentURI` (the live registration file). Idempotent by name: one the
 * registry already holds from this creator is skipped. Keys are read from ~/.config/cwf/testnet/ and never printed.
 *
 *   DATABASE_URL=… pnpm --dir scripts exec tsx drive/s9-house.ts [--origin https://testnet.mitoshi.xyz]
 */
import { decodeEventLog, getAddress, hexToString, type Address, type Hex } from "viem";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { parseStrategyMetadata, type StrategyEnvelope, type StrategyMetadata, type StrategySpec, type TxIntent } from "@cwf/core";
import { createSql, runMigrations, setAgentRegistrationUri, upsertAgentRegistration } from "@cwf/db";
import { buildAgentRegistration, readRegistered, registerAgentCall, registrationUrl, setAgentUriCall, tempoReadClient } from "@cwf/markets";
import { encodeStrategyIntent, strategyVenueOf } from "@cwf/markets/strategies";
import { castSend } from "../lib/cast";
import { loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const origin = argv.includes("--origin") ? argv[argv.indexOf("--origin") + 1]! : "https://testnet.mitoshi.xyz";
const CHAIN_ID = 42431;
const ONE = 1_000_000n;
const client = tempoReadClient("testnet", process.env.TEMPO_RPC_HTTP_URL);
const runner = getAddress(loadRole("strategy-runner").address);
const signer = { role: "strategy-runner" } as const;
const venue = strategyVenueOf(CHAIN_ID);
if (!venue) throw new Error("no StrategyRegistry on Moderato");
const SERIES = { BTC: "0x7c366cf9ea9bdb3de6894bbfe4ec96e0758ddd88f2c87277cec590c5cfd6a45d", ETH: "0xcd91c96ec51ab189c340b40adf936c8102c63f98ccf5b340c6b4a75fa1fa9441" } as const;

/** $5 a trade, $50 a day, three Windows at once, never above 90¢ a side; one series each. */
const envelope = (series: Hex): StrategyEnvelope => ({ maxStakePerTradeBase: 5n * ONE, maxDailySpendBase: 50n * ONE, maxOpenPositions: 3, maxPriceRaw: 900_000n, series: series as StrategyEnvelope["series"] });

const HOUSE: { name: string; description: string; spec: StrategySpec; series: Hex }[] = [
  {
    name: "BTC Momentum",
    description: "Rides BTC's five-minute move. When the last six prints climbed or fell by at least 0.20%, it takes that side on the live Window; otherwise it sits the round out.",
    spec: { preset: "momentum", lookback: 6, thresholdBps: 20 },
    series: SERIES.BTC,
  },
  {
    name: "ETH Mean-reversion",
    description: "Bets against ETH's sharp five-minute moves. After a run of at least 0.30% over the last four prints it takes the other side, expecting a pullback.",
    spec: { preset: "reversion", lookback: 4, thresholdBps: 30 },
    series: SERIES.ETH,
  },
  {
    name: "House agent: BTC reader",
    description: "An AI agent that reads each BTC five-minute Window once — the opening print, the move so far and both books — and calls up, down or hold. A fixed gate holds any weak call.",
    spec: {
      preset: "agent",
      persona: "A patient desk trader on BTC's five-minute Windows. Reads the opening print, the move since, and both sides of the book. Sits out unless the tape and the book agree; never chases a price that has already run.",
      posture: "guarded",
      cadences: [300],
    },
    series: SERIES.BTC,
  },
];

const registryRead = <T>(functionName: string, args: readonly unknown[] = []) =>
  client.readContract({ address: venue.strategyRegistry, abi: strategyRegistryAbi, functionName: functionName as never, args: args as never }) as Promise<T>;

/** This creator's strategies by name, from the chain itself. */
async function publishedByName(): Promise<Map<string, bigint>> {
  const count = await registryRead<bigint>("strategyCount");
  const out = new Map<string, bigint>();
  for (let id = 1n; id <= count; id++) {
    const s = await registryRead<{ creator: Address }>("strategyOf", [id]);
    if (s.creator.toLowerCase() !== runner.toLowerCase()) continue;
    const meta = parseStrategyMetadata(hexToString(await registryRead<Hex>("metadataOf", [id])));
    if (meta) out.set(meta.name, id);
  }
  return out;
}

const sql = process.env.DATABASE_URL ? createSql() : null;
if (sql) await runMigrations(sql);
const existing = await publishedByName();
console.log(JSON.stringify({ registry: venue.strategyRegistry, runner, existing: Object.fromEntries([...existing].map(([k, v]) => [k, v.toString()])) }));

for (const h of HOUSE) {
  if (existing.has(h.name)) {
    console.log(JSON.stringify({ step: "skip", name: h.name, strategyId: existing.get(h.name)!.toString() }));
    continue;
  }
  // 1. the agent, its registration self-contained until the strategy id it serves under exists
  const predicted = ((await registryRead<bigint>("strategyCount")) + 1n).toString();
  const meta = { name: h.name, description: h.description, image: `${origin}/api/agents/${predicted}/image.svg` };
  const preMint = buildAgentRegistration({ strategyId: predicted, ...meta, origin, active: true, registrations: [] });
  const reg = registerAgentCall(CHAIN_ID, `data:application/json;base64,${Buffer.from(JSON.stringify(preMint)).toString("base64")}`);
  const r1 = castSend([reg.to, reg.data], { signer });
  const registered = readRegistered(CHAIN_ID, r1.logs);
  if (r1.status !== "0x1" || !registered) throw new Error(`register failed for ${h.name}`);
  console.log(JSON.stringify({ step: "register", name: h.name, agentId: registered.agentId.toString(), tx: r1.transactionHash, block: BigInt(r1.blockNumber).toString() }));

  // 2. publish, naming the agent
  const metadata: StrategyMetadata = { name: h.name, description: h.description, spec: h.spec };
  const intent: TxIntent = { kind: "strategy-publish", runner, spec: h.spec, metadata, envelope: envelope(h.series), feeBase: 0n, agentId: registered.agentId };
  const encoded = encodeStrategyIntent(intent, { chainId: CHAIN_ID, wallet: runner });
  if (!encoded?.ok) throw new Error(`encode refused: ${encoded?.diagnosis.technical}`);
  const r2 = castSend([encoded.value.calls[0]!.to, encoded.value.calls[0]!.data], { signer, extra: ["--gas-limit", "8000000"] });
  if (r2.status !== "0x1") throw new Error(`publish failed for ${h.name}`);
  const published = r2.logs
    .filter((l) => l.address.toLowerCase() === venue.strategyRegistry.toLowerCase())
    .map((l) => decodeEventLog({ abi: strategyRegistryAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }))
    .find((e) => e.eventName === "Published");
  const strategyId = (published?.args as { strategyId?: bigint } | undefined)?.strategyId;
  if (strategyId === undefined) throw new Error("no Published event");
  console.log(JSON.stringify({ step: "publish", name: h.name, strategyId: strategyId.toString(), agentId: registered.agentId.toString(), tx: r2.transactionHash, block: BigInt(r2.blockNumber).toString(), gas: BigInt(r2.gasUsed).toString() }));

  // 3–4. the row the registration route serves, then the agent points at it
  if (!sql) {
    console.log(JSON.stringify({ step: "pending", note: "no DATABASE_URL: record the registration and setAgentURI later", strategyId: strategyId.toString() }));
    continue;
  }
  const key = strategyId.toString();
  const liveUri = registrationUrl(origin, key);
  await upsertAgentRegistration(sql, { chainId: CHAIN_ID, agentId: registered.agentId, strategyId: key, owner: runner, ...meta, image: `${origin}/api/agents/${key}/image.svg`, agentUri: liveUri, active: true, registerTx: r1.transactionHash });
  const set = setAgentUriCall(CHAIN_ID, registered.agentId, liveUri);
  const r3 = castSend([set.to, set.data], { signer });
  if (r3.status !== "0x1") throw new Error(`setAgentURI failed for ${h.name}`);
  await setAgentRegistrationUri(sql, CHAIN_ID, registered.agentId, liveUri);
  console.log(JSON.stringify({ step: "setAgentURI", name: h.name, uri: liveUri, tx: r3.transactionHash }));
}
await sql?.end();
