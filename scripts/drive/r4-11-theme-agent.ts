/**
 * R4-11 live check (D-227) on Moderato: ops' `theme-agent` pass, dry, over the live follow of theme #1 (the agent key from
 * `r4-11-theme-follow.ts`, sealed here under a throwaway secret in an in-memory key store): it reads the follow, the
 * theme's session and interval, the members' oracle prices and the follower's balances, then says what it would do.
 * Outside the theme's hours it says so; the plan core would send is printed beside it from the same reads.
 *
 * With `--send` the pass is not dry: inside the theme's hours it signs `[approve × k, rebalance]` with the agent key as
 * the follower's access key — no prompt, no root signature (the 16a gate).
 *
 *   tsx scripts/drive/r4-11-theme-agent.ts [--role deployer-themes] [--theme 1] [--send]
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, erc20Abi, getAddress, http, parseAbi, type Hex, type PublicClient } from "viem";
import { tempoModerato } from "viem/chains";
import { planRebalance, themeDrift, type DriftMember } from "@cwf/core";
import type { ThemeKeyRow, ThemeKeyStore } from "@cwf/db";
import { themeRegistryAbi } from "@cwf/clients/abis/ThemeRegistry";
import { themeRouterAbi } from "@cwf/clients/abis/ThemeRouter";
import { PATH_USD_ADDRESS, themesVenueOf } from "@cwf/markets/themes";
import { sealKey, themeAgentPass } from "../../services/ops/src/actors/theme-agent/index";
import { loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const role = argv.includes("--role") ? argv[argv.indexOf("--role") + 1]! : "deployer-themes";
const themeId = BigInt(argv.includes("--theme") ? argv[argv.indexOf("--theme") + 1]! : "1");
const rpcUrl = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
const client = createPublicClient({ chain: tempoModerato, transport: http(rpcUrl) }) as unknown as PublicClient;
const follower = getAddress(loadRole(role).address);
const agent = JSON.parse(readFileSync(join(homedir(), ".config", "cwf", "testnet", themeId === 1n ? "theme-agent-r411.json" : `theme-agent-r411-${themeId}.json`), "utf8")) as { privateKey: Hex; address: string };
const secret = randomBytes(32).toString("hex");
const row: ThemeKeyRow = { id: "1", follower: follower.toLowerCase(), themeId, keyId: agent.address.toLowerCase(), sealed: sealKey(secret, agent.privateKey), lastNote: null };
const keys: ThemeKeyStore = {
  request: async () => row, get: async () => row, pending: async () => [], issue: async () => undefined, issued: async () => [row],
  note: async (_id, note) => void (row.lastNote = note),
};
const r = await themeAgentPass({ client, chainId: 42431, rpcUrl, keys, secret, dryRun: !argv.includes("--send") })();
console.log(`pass: ${r.why}`);
console.log(`note: ${row.lastNote}`);

// The same reads, planned regardless of the session: what the agent will send once the theme's hours open.
const v = themesVenueOf(42431)!;
const ORACLE = parseAbi(["function tokenPrice(address) view returns (uint256, uint64, bool)"]);
const oracle = await client.readContract({ address: v.router, abi: themeRouterAbi, functionName: "oracle" });
const f = await client.readContract({ address: v.router, abi: themeRouterAbi, functionName: "followOf", args: [follower, themeId] });
const t = await client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "theme", args: [themeId] });
const tokens = await client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "tokensOf", args: [themeId, t.version] });
const members: DriftMember[] = await Promise.all(tokens.map(async (token) => {
  const [[, band], [price], balance] = await Promise.all([
    client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "bandOf", args: [themeId, t.version, token] }),
    client.readContract({ address: oracle, abi: ORACLE, functionName: "tokenPrice", args: [token] }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [follower] }),
  ]);
  return { token, balance, priceE18: price > 0n ? price : null, band };
}));
const cash = await client.readContract({ address: PATH_USD_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [follower] });
const drift = themeDrift(members, cash, f.caps.allocationUsd);
console.log(`drift: total ${drift.totalUsd} cash ${drift.cashUsd} priced ${drift.priced} · ${drift.rows.map((x) => `${x.token.slice(0, 10)} ${x.weightBps}bps ${x.out ?? "in"}`).join(", ")}`);
const nowSec = Math.floor(Date.now() / 1000);
const dailyLeftUsd = nowSec >= Number(f.dayStart) + 86_400 ? f.caps.maxDailyUsd : f.caps.maxDailyUsd - f.daySpentUsd;
const legs = planRebalance(members, drift, { pathUsd: PATH_USD_ADDRESS, maxTradeUsd: f.caps.maxTradeUsd, maxSlippageBps: Math.min(t.maxSlippageBps, f.caps.maxSlippageBps), dailyLeftUsd });
console.log(`plan: ${legs.length ? legs.map((l) => `${l.tokenIn.slice(0, 10)}→${l.tokenOut.slice(0, 10)} in ${l.amountIn} min ${l.minAmountOut}`).join("; ") : "none"}`);
process.exit(0);
