/**
 * The `theme-agent` actor (S16a; R4-11, D-227; plan B.4.3–B.4.4): issues each follower's theme key and rebalances their
 * wallet inside the theme's bands with it — no prompt. One pass:
 *   1. every key request the web filed (`theme_agent_keys`, key null) gets a fresh secp256k1 key, sealed with
 *      AES-256-GCM under `THEME_KEYS_SECRET` (ops only; the web never holds a key) — the follower then authorises it
 *      in their own follow transaction;
 *   2. for every issued key the router still names (`followOf(follower, theme).keyId`, active, same version): the
 *      session the theme allows (`oracle.currentSession`), its interval since `lastRebalanceAt`, the members' reference
 *      prices (`oracle.tokenPrice`) and balances → core's drift and plan → `[approve × k, rebalance]` signed by the key
 *      as the follower's access key (`sendBatch`, self-paid; its fee counts against the key's pathUSD limit).
 * Opt-in (`OPS_ACTORS=…,theme-agent`); DRY_RUN or a missing secret plans and says so, never sends.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { erc20Abi, getAddress, parseAbi, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { planRebalance, themeDrift, type DriftMember } from "@cwf/core";
import type { ThemeKeyStore } from "@cwf/db";
import { themeRegistryAbi } from "@cwf/clients/abis/ThemeRegistry";
import { themeRouterAbi } from "@cwf/clients/abis/ThemeRouter";
import { buildRebalanceCalls, decisionIdOf, PATH_USD_ADDRESS, sendThemeRebalance, themesVenueOf } from "@cwf/markets/themes";
import type { PassResult } from "../../runtime";

export const THEME_AGENT_EVERY_MS = 30_000;
const ORACLE_ABI = parseAbi(["function tokenPrice(address mirror) view returns (uint256 usdPerTokenE18, uint64 observedAt, bool halted)", "function currentSession() view returns (uint8)"]);

/** AES-256-GCM: iv(12) ‖ tag(16) ‖ ciphertext. The secret is 32 bytes as 64 hex characters. */
export function sealKey(secretHex: string, privateKey: Hex): Uint8Array {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(secretHex, "hex"), iv);
  const body = Buffer.concat([c.update(Buffer.from(privateKey.slice(2), "hex")), c.final()]);
  return new Uint8Array(Buffer.concat([iv, c.getAuthTag(), body]));
}

export function unsealKey(secretHex: string, sealed: Uint8Array): Hex {
  const b = Buffer.from(sealed);
  const d = createDecipheriv("aes-256-gcm", Buffer.from(secretHex, "hex"), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return `0x${Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("hex")}` as Hex;
}

export interface ThemeAgentDeps {
  client: PublicClient;
  chainId: number;
  rpcUrl: string;
  keys: ThemeKeyStore;
  /** 64 hex characters; null keeps the actor planning only. */
  secret: string | null;
  dryRun: boolean;
}

export function themeAgentPass(d: ThemeAgentDeps): () => Promise<PassResult> {
  const v = themesVenueOf(d.chainId);
  return async () => {
    if (!v) return { why: `themes are not deployed on chain ${d.chainId}` };
    let issued = 0;
    if (d.secret) {
      // A key only for a theme that exists (the web files any number a signed-in account asks for).
      const count = await d.client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "themeCount" });
      for (const req of await d.keys.pending()) {
        if (req.themeId > count) {
          await d.keys.note(req.id, "no such theme");
          continue;
        }
        const pk = generatePrivateKey();
        await d.keys.issue(req.id, privateKeyToAccount(pk).address, sealKey(d.secret, pk));
        issued++;
      }
    }
    const notes: string[] = [];
    const nowSec = Math.floor(Date.now() / 1000);
    const oracle = await d.client.readContract({ address: v.router, abi: themeRouterAbi, functionName: "oracle" });
    const session = Number(await d.client.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "currentSession" }));
    for (const row of await d.keys.issued()) {
      const follower = getAddress(row.follower);
      const say = async (note: string) => (notes.push(`${follower.slice(0, 8)}#${row.themeId}: ${note}`), d.keys.note(row.id, note));
      const f = await d.client.readContract({ address: v.router, abi: themeRouterAbi, functionName: "followOf", args: [follower, row.themeId] });
      if (!f.active || f.keyId.toLowerCase() !== row.keyId) {
        await say(f.active ? "followed with another key" : "not following");
        continue;
      }
      const t = await d.client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "theme", args: [row.themeId] });
      if (t.version !== f.version) {
        await say(`theme moved to v${t.version}; the follow is v${f.version}`);
        continue;
      }
      if (((t.sessionsMask >> session) & 1) === 0) {
        await say(`session ${session} is outside the theme's hours`);
        continue;
      }
      const interval = Math.max(t.minIntervalSec, f.caps.minIntervalSec);
      if (f.lastRebalanceAt !== 0 && nowSec < f.lastRebalanceAt + interval) {
        await say("inside the rebalance interval");
        continue;
      }
      const tokens = await d.client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "tokensOf", args: [row.themeId, t.version] });
      const members: DriftMember[] = await Promise.all(
        tokens.map(async (token) => {
          const [[, band], [price, observedAt, halted], balance] = await Promise.all([
            d.client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "bandOf", args: [row.themeId, t.version, token] }),
            d.client.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "tokenPrice", args: [token] }),
            d.client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [follower] }),
          ]);
          const usable = !halted && price > 0n && (nowSec <= Number(observedAt) || nowSec - Number(observedAt) <= t.maxRefAgeSec);
          return { token, balance, priceE18: usable ? price : null, band: { minBps: band.minBps, targetBps: band.targetBps, maxBps: band.maxBps, allowed: band.allowed } };
        }),
      );
      const cash = await d.client.readContract({ address: PATH_USD_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [follower] });
      const drift = themeDrift(members, cash, f.caps.allocationUsd);
      if (!drift.priced) {
        await say("a member has no usable reference price");
        continue;
      }
      const dailyLeftUsd = nowSec >= Number(f.dayStart) + 86_400 ? f.caps.maxDailyUsd : f.caps.maxDailyUsd - f.daySpentUsd;
      const legs = planRebalance(members, drift, { pathUsd: PATH_USD_ADDRESS, maxTradeUsd: f.caps.maxTradeUsd, maxSlippageBps: Math.min(t.maxSlippageBps, f.caps.maxSlippageBps), dailyLeftUsd }).map((l) => ({ ...l, tokenIn: getAddress(l.tokenIn), tokenOut: getAddress(l.tokenOut) }));
      if (legs.length === 0) {
        await say("in band");
        continue;
      }
      const calls = buildRebalanceCalls({ router: v.router, themeId: row.themeId, legs, creatorFeeBps: t.creatorFeeBps, decisionId: decisionIdOf(follower, row.themeId, nowSec) });
      if (d.dryRun || !d.secret || !row.sealed) {
        await say(`dry: ${legs.length} leg(s) planned`);
        continue;
      }
      try {
        const sent = await sendThemeRebalance({ chain: d.client.chain!, rpcUrl: d.rpcUrl, keyPrivateKey: unsealKey(d.secret, row.sealed), follower, calls, nowSec });
        await say(`${sent.status === "success" ? "rebalanced" : "reverted"} ${sent.hash}`);
      } catch (e) {
        await say(`send failed: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]!.slice(0, 160)}`);
      }
    }
    return { why: `${issued} key(s) issued; ${notes.length} follow(s): ${notes.slice(0, 4).join(" · ") || "none"}${d.secret ? "" : " (THEME_KEYS_SECRET missing: no keys, no sends)"}`, detail: { issued, notes } };
  };
}
