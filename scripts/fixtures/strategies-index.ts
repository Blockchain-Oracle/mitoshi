/**
 * Regenerates `packages/db/src/idx/fixtures/moderato-s9-strategies.json`: every StrategyRegistry log on Moderato from its
 * deploy block, and every ERC-8004 feedback log from the first agent the product names (house agent 6), to `TO_BLOCK`
 * (default: head) — decoded by `@cwf/markets/ops` exactly as the indexer stores them (metadata included) — plus what
 * the chain itself says at that block: each strategy (`strategyOf`), each (strategy, subscriber) consent
 * (`subscriptionOf`) and each feedback (`readFeedback`). The projection test asserts the index agrees. Read-only.
 *
 *   pnpm --dir scripts exec tsx fixtures/strategies-index.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Address } from "viem";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { createOpsClient, feedbackSourceOf, fetchFeedbackEvents, fetchStrategyEvents, strategyRegistriesOf, type ChainEvent } from "@cwf/markets/ops";
import { reputationRegistryAbi } from "@cwf/markets";

const client = createOpsClient({ network: "testnet", rpcUrl: process.env.TEMPO_RPC_HTTP_URL });
const registry = strategyRegistriesOf(client.chainId)[0]!;
const feedback = feedbackSourceOf(client.chainId)!;
const to = process.env.TO_BLOCK ? BigInt(process.env.TO_BLOCK) : await client.public.getBlockNumber();
const walk = async (from: bigint, fetch: (f: bigint, t: bigint) => Promise<ChainEvent[]>) => {
  const out: ChainEvent[] = [];
  for (let f = from; f <= to; f += 100_000n) out.push(...(await fetch(f, f + 99_999n < to ? f + 99_999n : to)));
  return out;
};
const strategyEvents = await walk(registry.deployBlock, (f, t) => fetchStrategyEvents(client, registry.registry, f, t));
const feedbackEvents = await walk(feedback.fromBlock, (f, t) => fetchFeedbackEvents(client, feedback.reputation, f, t));

const at = { blockNumber: to } as const;
const reg = { address: registry.registry, abi: strategyRegistryAbi } as const;
const ids = [...new Set(strategyEvents.filter((e) => e.name === "Published").map((e) => String(e.data.strategyId)))];
const strategies = Object.fromEntries(
  await Promise.all(ids.map(async (id) => {
    const s = (await client.public.readContract({ ...reg, functionName: "strategyOf", args: [BigInt(id)], ...at })) as { runner: Address; subscriptionFee: bigint; active: boolean; subscribers: number; revision: number; agentId: bigint };
    return [id, { runner: s.runner.toLowerCase(), feeBase: String(s.subscriptionFee), active: s.active, subscribers: Number(s.subscribers), revision: Number(s.revision), agentId: String(s.agentId) }];
  })),
);
const pairs = [...new Set(strategyEvents.filter((e) => e.name === "Subscribed").map((e) => `${e.data.strategyId}:${String(e.data.subscriber).toLowerCase()}`))];
const subscriptions = Object.fromEntries(
  await Promise.all(pairs.map(async (k) => {
    const [id, who] = k.split(":") as [string, Address];
    const s = (await client.public.readContract({ ...reg, functionName: "subscriptionOf", args: [BigInt(id), who], ...at })) as { grantId: bigint; mode: number; active: boolean };
    return [k, { grantId: String(s.grantId), mode: s.mode, active: s.active }];
  })),
);
const given = feedbackEvents.filter((e) => e.name === "NewFeedback");
const feedbackState = Object.fromEntries(
  await Promise.all(given.map(async (e) => {
    const [value, decimals, , , revoked] = (await client.public.readContract({ address: feedback.reputation, abi: reputationRegistryAbi, functionName: "readFeedback", args: [BigInt(String(e.data.agentId)), e.data.clientAddress as Address, BigInt(String(e.data.feedbackIndex))], ...at })) as [bigint, number, string, string, boolean];
    return [`${e.data.agentId}:${String(e.data.clientAddress).toLowerCase()}:${e.data.feedbackIndex}`, { value: String(value), valueDecimals: decimals, revoked }];
  })),
);
const file = join(import.meta.dirname, "..", "..", "packages", "db", "src", "idx", "fixtures", "moderato-s9-strategies.json");
writeFileSync(file, `${JSON.stringify({
  _doc: `Every StrategyRegistry log on Moderato (${registry.registry}, blocks ${registry.deployBlock}–${to}) and every ERC-8004 feedback log (${feedback.reputation}, from ${feedback.fromBlock}), decoded by @cwf/markets/ops as the indexer stores them, and the chain's own strategyOf/subscriptionOf/readFeedback at block ${to}. Fixture for the strategy projection test.`,
  toBlock: String(to), registry: registry.registry.toLowerCase(), reputation: feedback.reputation.toLowerCase(), events: [...strategyEvents, ...feedbackEvents], chain: { strategies, subscriptions, feedback: feedbackState },
}, null, 1)}\n`);
console.log(JSON.stringify({ file, strategyEvents: strategyEvents.length, feedbackEvents: feedbackEvents.length, strategies: ids.length, subscriptions: pairs.length, toBlock: String(to) }));
