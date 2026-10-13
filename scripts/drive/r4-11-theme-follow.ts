/**
 * R4-11 live check (D-227) on Moderato: a follow of theme #1 with the exact calls the app encodes — `encodeThemeIntent`
 * `theme-follow` = `[AccountKeychain.authorizeKey(the agent's key, scoped to rebalance@router and approve(router) on
 * pathUSD and each theme token, daily limits from core's plan), ThemeRouter.follow]` in one root transaction — sent by
 * `cast` from the follower's key, then read back: `followOf`, the router's Followed event through the app's activity
 * read, and the key's scopes as the router checked them. The agent key is a testnet key kept like a role
 * (`~/.config/cwf/testnet/theme-agent-r411.json`, 0600, never printed) for the rebalance that waits for a session the
 * theme allows. The relay sponsors this shape in the app; the engine test proves that.
 *
 *   tsx scripts/drive/r4-11-theme-follow.ts [--role deployer-themes] [--theme 1]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { configureMarkets, parseMarketsEnv } from "@cwf/markets";
import { pathUsdDailyLimit, tokenDailyLimit } from "@cwf/core";
import { encodeThemeIntent, getFollow, getTheme, getThemeActivity } from "@cwf/markets/themes";
import { getAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { castBatch } from "../lib/cast";
import { loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const role = argv.includes("--role") ? argv[argv.indexOf("--role") + 1]! : "deployer-themes";
const themeId = BigInt(argv.includes("--theme") ? argv[argv.indexOf("--theme") + 1]! : "1");
configureMarkets(parseMarketsEnv({ network: "testnet" }));
const me = getAddress(loadRole(role).address);
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const must = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`read failed: ${json(r.error)}`);
  return r.value;
};

const keyFile = join(homedir(), ".config", "cwf", "testnet", themeId === 1n ? "theme-agent-r411.json" : `theme-agent-r411-${themeId}.json`);
if (!existsSync(keyFile)) {
  const pk = generatePrivateKey();
  writeFileSync(keyFile, JSON.stringify({ privateKey: pk, address: privateKeyToAccount(pk).address }), { mode: 0o600 });
}
const agent = privateKeyToAccount((JSON.parse(readFileSync(keyFile, "utf8")) as { privateKey: Hex }).privateKey);
console.log(`follower ${me} · agent key ${agent.address}`);

const t = must(await getTheme(themeId))!;
const nowSec = Math.floor(Date.now() / 1000);
const caps = { expirySec: nowSec + 7 * 86_400, allocationUsd: 100_000_000n, maxTradeUsd: 20_000_000n, maxDailyUsd: 50_000_000n, maxSlippageBps: 100, maxFeeBps: 50, minIntervalSec: 3_600 };
const tokens = t.members.map((m) => m.token);
const e = encodeThemeIntent(
  { kind: "theme-follow", themeId, version: t.version, caps, keyId: agent.address, tokens, tokenDailyLimits: t.members.map((m) => tokenDailyLimit(caps.maxDailyUsd, m.refPriceE18)), pathUsdDailyLimit: pathUsdDailyLimit(caps.maxDailyUsd, t.creatorFeeBps) },
  { chainId: 42431, wallet: me },
);
if (!e?.ok) throw new Error(`not encoded: ${e ? e.diagnosis.technical : "unclaimed"}`);
console.log(`theme #${themeId} v${t.version}: ${t.members.map((m) => `${m.symbol} limit ${tokenDailyLimit(caps.maxDailyUsd, m.refPriceE18)}`).join(", ")}; ${e.value.calls.length} calls, sponsored in the app: ${e.value.sponsored}`);
const r = castBatch(e.value.calls, { signer: { role } });
console.log(`follow ${r.transactionHash} block ${BigInt(r.blockNumber)} gas ${BigInt(r.gasUsed)} status ${r.status}`);
if (r.status !== "0x1") throw new Error("follow reverted");

const f = must(await getFollow(me, themeId));
console.log(`followOf: ${json(f)}`);
const a = must(await getThemeActivity(themeId));
console.log(`getThemeActivity: followers ${a.followers.length} (${a.followers.join(", ")}), rebalances ${a.rebalances.length}`);
process.exit(0);
