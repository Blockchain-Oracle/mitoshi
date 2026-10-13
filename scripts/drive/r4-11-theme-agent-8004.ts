/**
 * R4-11 live check (D-227) on Moderato: the theme agent's ERC-8004 registration (S16a). The themes creator registers
 * the agent once in the pinned IdentityRegistry (`registerAgentCall`, agentURI = the app's
 * `/api/themes/agent/registration.json`), then names it on its themes with the app's `theme-set-agent` encoding
 * (`ThemeRegistry.setAgent`), one batch per step, sent by `cast` from the creator's role key; then reads back
 * `readAgent` and each theme's `erc8004AgentId` through the app's theme read.
 *
 *   tsx scripts/drive/r4-11-theme-agent-8004.ts [--role deployer-themes] [--themes 1,2] [--origin https://testnet.mitoshi.xyz]
 */
import { configureMarkets, parseMarketsEnv, readAgent, readRegistered, registerAgentCall, tempoReadClient } from "@cwf/markets";
import { themeRegistryAbi } from "@cwf/clients/abis/ThemeRegistry";
import { encodeThemeIntent, getTheme, themeAgentUri, themesVenueOf } from "@cwf/markets/themes";
import { getAddress, type Hex } from "viem";
import { castBatch } from "../lib/cast";
import { loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const flag = (n: string, d: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1]! : d);
const role = flag("--role", "deployer-themes");
const themes = flag("--themes", "1,2").split(",").map((s) => BigInt(s));
const origin = flag("--origin", "https://testnet.mitoshi.xyz");
const CHAIN = 42431;
configureMarkets(parseMarketsEnv({ network: "testnet" }));
const me = getAddress(loadRole(role).address);
const client = tempoReadClient("testnet");

let agentId = argv.includes("--agent") ? BigInt(flag("--agent", "0")) : null;
if (agentId === null) {
  const uri = themeAgentUri(origin);
  const r = castBatch([registerAgentCall(CHAIN, uri)], { signer: { role } });
  console.log(`register ${r.transactionHash} block ${BigInt(r.blockNumber)} gas ${BigInt(r.gasUsed)} status ${r.status}`);
  if (r.status !== "0x1") throw new Error("register reverted");
  const reg = readRegistered(CHAIN, (await client.getTransactionReceipt({ hash: r.transactionHash as Hex })).logs);
  if (!reg) throw new Error("no Registered event");
  agentId = reg.agentId;
}
const a = await readAgent(client, CHAIN, agentId);
console.log(`agent #${agentId}: owner ${a.owner} uri ${a.agentURI}`);

for (const id of themes) {
  const t = await getTheme(id);
  if (!t.ok || !t.value) throw new Error(`theme #${id} unreadable`);
  if (t.value.creator.toLowerCase() !== me.toLowerCase()) {
    console.log(`theme #${id}: creator ${t.value.creator} is not ${me}; skipped`);
    continue;
  }
  if (t.value.agentId === agentId) {
    console.log(`theme #${id}: already agent #${agentId}`);
    continue;
  }
  const e = encodeThemeIntent({ kind: "theme-set-agent", themeId: id, agentId }, { chainId: CHAIN, wallet: me });
  if (!e?.ok) throw new Error(`not encoded: ${e ? e.diagnosis.technical : "unclaimed"}`);
  const r = castBatch(e.value.calls, { signer: { role } });
  console.log(`theme #${id} setAgent ${r.transactionHash} block ${BigInt(r.blockNumber)} status ${r.status}`);
  if (r.status !== "0x1") throw new Error("setAgent reverted");
}
const v = themesVenueOf(CHAIN)!;
for (const id of themes) {
  const t = await client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "theme", args: [id] });
  console.log(`theme #${id} read back on chain: erc8004AgentId ${t.erc8004AgentId}`);
}
process.exit(0);
