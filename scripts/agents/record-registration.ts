/**
 * Records an already-registered ERC-8004 agent in `agent_registrations` from its on-chain register receipt, so the
 * web route serves its registration file — run against the deployed network's DATABASE_URL after a registration made
 * elsewhere (e.g. S3.5's smoke agent, registered with a local database). Reads chain state only; signs nothing.
 *
 *   DATABASE_URL=… tsx scripts/agents/record-registration.ts <registerTxHash> <strategyId> [--name …] [--description …]
 */
import type { Hex } from "viem";
import { createSql, runMigrations, upsertAgentRegistration } from "@cwf/db";
import { readAgent, readRegistered, tempoReadClient } from "@cwf/markets";

const [txHash, strategyId] = process.argv.slice(2) as [Hex | undefined, string | undefined];
if (!txHash || !strategyId) throw new Error("usage: record-registration.ts <registerTxHash> <strategyId> [--name …] [--description …] [--origin …]");
const flag = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1]! : fallback);
const origin = flag("--origin", "https://testnet.mitoshi.xyz");
const CHAIN_ID = 42431;
const client = tempoReadClient("testnet", process.env.TEMPO_RPC_HTTP_URL);

const receipt = await client.getTransactionReceipt({ hash: txHash });
const registered = readRegistered(CHAIN_ID, receipt.logs);
if (receipt.status !== "success" || !registered) throw new Error(`${txHash} is not a successful ERC-8004 register on ${CHAIN_ID}`);
const agent = await readAgent(client, CHAIN_ID, registered.agentId);

const sql = createSql();
await runMigrations(sql);
await upsertAgentRegistration(sql, {
  chainId: CHAIN_ID,
  agentId: registered.agentId,
  strategyId,
  owner: agent.owner,
  name: flag("--name", "Mitoshi smoke agent (S3.5)"),
  description: flag("--description", "A test agent registered by the Mitoshi platform on Moderato to prove the ERC-8004 client: register, point at the live registration file, and receive feedback from a separate rater."),
  image: `${origin}/api/agents/${strategyId}/image.svg`,
  agentUri: agent.agentURI,
  active: true,
  registerTx: txHash,
});
await sql.end();
console.log(`recorded agent ${registered.agentId} (owner ${agent.owner}, agentURI ${agent.agentURI}) as strategy "${strategyId}"`);
