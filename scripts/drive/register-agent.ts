/**
 * S3.5 live drive (N-07, AG-1, AG-15): an ERC-8004 agent on Moderato through `@cwf/markets` agents, sent by `cast`.
 *
 *   1. deployer `register(data:…)` — a self-contained registration file (the agent id is unknown before the mint)
 *   2. the `agent_registrations` row (DATABASE_URL), so `/api/agents/<strategyId>/registration.json` serves the file
 *   3. deployer `setAgentURI(agentId, https://…/registration.json)` — the agent now points at the live file
 *   4. self-feedback from the owner is simulated and must revert ("Self-feedback not allowed", AG-15)
 *   5. keeper (a separate rater) `giveFeedback(agentId, 100, 0, "s3.5", "smoke", …)`
 *   6. read back: owner, agentURI, agent wallet, readAllFeedback, getSummary([keeper]), registry versions
 *
 *   DATABASE_URL=postgres://… tsx scripts/drive/register-agent.ts [--origin https://mitoshi.xyz] [--strategy id]
 */
import { getAddress, type Address } from "viem";
import { createSql, runMigrations, setAgentRegistrationUri, upsertAgentRegistration } from "@cwf/db";
import {
  buildAgentRegistration,
  erc8004Registries,
  giveFeedbackCall,
  readAgent,
  readAllFeedback,
  readFeedbackSummary,
  readNewFeedback,
  readRegistered,
  readRegistryVersion,
  registerAgentCall,
  registrationUrl,
  setAgentUriCall,
  tempoReadClient,
} from "@cwf/markets";
import { castSend, loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1]! : fallback);
const origin = arg("--origin", "https://mitoshi.xyz");
const strategyId = arg("--strategy", "s3-5-smoke-agent");
const CHAIN_ID = 42431;
const client = tempoReadClient("testnet", process.env.TEMPO_RPC_HTTP_URL);
const owner = getAddress(loadRole("deployer").address);
const rater = getAddress(loadRole("keeper").address);
const meta = {
  name: "Mitoshi smoke agent (S3.5)",
  description: "A test agent registered by the Mitoshi platform on Moderato to prove the ERC-8004 client: register, point at the live registration file, and receive feedback from a separate rater.",
  image: `${origin}/api/agents/${strategyId}/image.svg`,
};

const sql = createSql();
await runMigrations(sql);
const registries = erc8004Registries(CHAIN_ID);
console.log(`registries: identity ${registries.identity} reputation ${registries.reputation}; versions ${JSON.stringify(await readRegistryVersion(client, CHAIN_ID))}`);

// 1. register with a self-contained data: URI
const preMint = buildAgentRegistration({ strategyId, ...meta, origin, active: true, registrations: [] });
const dataUri = `data:application/json;base64,${Buffer.from(JSON.stringify(preMint)).toString("base64")}`;
const reg = registerAgentCall(CHAIN_ID, dataUri);
const r1 = castSend([reg.to, reg.data]);
const registered = readRegistered(CHAIN_ID, r1.logs);
console.log(`register tx ${r1.transactionHash} block ${BigInt(r1.blockNumber)} status ${r1.status} gas ${BigInt(r1.gasUsed)}`);
if (r1.status !== "0x1" || !registered) throw new Error("register failed or emitted no Registered event");
console.log(`  → agentId ${registered.agentId}, owner ${registered.owner}`);

// 2. the row the registration route serves
const liveUri = registrationUrl(origin, strategyId);
await upsertAgentRegistration(sql, { chainId: CHAIN_ID, agentId: registered.agentId, strategyId, owner, ...meta, agentUri: dataUri, active: true, registerTx: r1.transactionHash });

// 3. point the agent at the live file
const set = setAgentUriCall(CHAIN_ID, registered.agentId, liveUri);
const r2 = castSend([set.to, set.data]);
console.log(`setAgentURI tx ${r2.transactionHash} block ${BigInt(r2.blockNumber)} status ${r2.status} gas ${BigInt(r2.gasUsed)} → ${liveUri}`);
if (r2.status !== "0x1") throw new Error("setAgentURI failed");
await setAgentRegistrationUri(sql, CHAIN_ID, registered.agentId, liveUri);

// 4. the owner cannot rate itself
const feedback = giveFeedbackCall(CHAIN_ID, { agentId: registered.agentId, value: 100n, valueDecimals: 0, tag1: "s3.5", tag2: "smoke", endpoint: liveUri });
try {
  await client.call({ account: owner as Address, to: feedback.to, data: feedback.data });
  throw new Error("self-feedback was NOT refused");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("NOT refused")) throw e;
  console.log(`self-feedback from the owner reverts: ${/Self-feedback not allowed/.test(msg) ? "\"Self-feedback not allowed\"" : msg.split("\n")[0]}`);
}

// 5. a separate rater
const r3 = castSend([feedback.to, feedback.data], { signer: { role: "keeper" } });
const nf = readNewFeedback(CHAIN_ID, r3.logs);
console.log(`giveFeedback tx ${r3.transactionHash} block ${BigInt(r3.blockNumber)} status ${r3.status} gas ${BigInt(r3.gasUsed)} → index ${nf?.feedbackIndex} from ${nf?.client}`);
if (r3.status !== "0x1" || !nf) throw new Error("giveFeedback failed");

// 6. read back
const agent = await readAgent(client, CHAIN_ID, registered.agentId);
console.log(`ownerOf ${agent.owner} · agentURI ${agent.agentURI} · agentWallet ${agent.wallet}`);
const all = await readAllFeedback(client, CHAIN_ID, registered.agentId);
for (const f of all) console.log(`  feedback #${f.feedbackIndex} from ${f.client}: ${f.value}/10^${f.valueDecimals} [${f.tag1}/${f.tag2}] revoked=${f.revoked}`);
const summary = await readFeedbackSummary(client, CHAIN_ID, registered.agentId, [rater]);
console.log(`getSummary([keeper]) count ${summary.count} value ${summary.value} decimals ${summary.valueDecimals}`);
await sql.end();
if (agent.agentURI !== liveUri || agent.owner !== owner || all.length !== 1 || summary.count !== 1n) throw new Error("read-back mismatch");
