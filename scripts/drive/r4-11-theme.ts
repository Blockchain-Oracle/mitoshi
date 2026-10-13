/**
 * R4-11 live check (D-227) on Moderato: a theme published with the exact call the app sends (`encodeThemeIntent`
 * `theme-publish`, the creator's own self-paid write) by `cast` from a key, then read back through the app's reads
 * (`@cwf/markets/themes`): the catalogue, the theme's bands and members with their StockReference prices, the spec
 * re-hashed from its on-chain data URI, and the eligible mirrors.
 *
 *   tsx scripts/drive/r4-11-theme.ts [--role deployer-themes] [--symbols TSLA,PLTR,NFLX] [--name …] [--blurb …]
 */
import { configureMarkets, parseMarketsEnv } from "@cwf/markets";
import { bandAround, specPayload, type ThemeSpec } from "@cwf/core";
import { encodeThemeIntent, getTheme, listEligibleMirrors, listThemes } from "@cwf/markets/themes";
import { getAddress, keccak256 } from "viem";
import { castBatch } from "../lib/cast";
import { loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const role = argv.includes("--role") ? argv[argv.indexOf("--role") + 1]! : "deployer-themes";
configureMarkets(parseMarketsEnv({ network: "testnet" }));
const me = getAddress(loadRole(role).address);
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const must = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`read failed: ${json(r.error)}`);
  return r.value;
};

const eligible = must(await listEligibleMirrors());
console.log(`eligible mirrors: ${eligible.map((m) => `${m.symbol} ${m.refPriceE18 ?? "-"}`).join(", ")}`);
const symbols = argv.includes("--symbols") ? argv[argv.indexOf("--symbols") + 1]!.split(",") : ["TSLA", "PLTR", "NFLX"];
const pick = symbols.map((s) => eligible.find((m) => m.symbol === s)).filter((m) => m !== undefined);
if (pick.length < 2) throw new Error("not enough eligible mirrors");
const targets = pick.length === 3 ? [4_000, 3_000, 2_000] : [5_000, 4_000];
const spec: ThemeSpec = {
  schema: 1,
  name: argv.includes("--name") ? argv[argv.indexOf("--name") + 1]! : "Builders' Stack",
  blurb: argv.includes("--blurb") ? argv[argv.indexOf("--blurb") + 1]! : "Cars, data and screens, rebalanced in bands.",
  creatorFeeBps: 25,
  maxSlippageBps: 100,
  minIntervalSec: 3_600,
  maxRefAgeSec: 345_600,
  sessionsMask: 1,
  bands: pick.map((m, i) => ({ token: m!.token, symbol: m!.symbol, ...bandAround(targets[i]!, "balanced"), allowed: true })),
  cashBand: bandAround(10_000 - targets.reduce((a, b) => a + b, 0), "balanced"),
};
const e = encodeThemeIntent({ kind: "theme-publish", spec, tokens: pick.map((m) => m!.token) }, { chainId: 42431, wallet: me });
if (!e?.ok) throw new Error(`not encoded: ${e ? e.diagnosis.technical : "unclaimed"}`);
const r = castBatch(e.value.calls, { signer: { role } });
console.log(`publish ${r.transactionHash} block ${BigInt(r.blockNumber)} gas ${BigInt(r.gasUsed)} status ${r.status} (self-paid in the app: ${!e.value.sponsored})`);
if (r.status !== "0x1") throw new Error("publish reverted");

const themes = must(await listThemes());
const t = themes[0]!;
console.log(`listThemes: ${themes.length}; newest #${t.themeId} v${t.version} by ${t.creator} fee ${t.creatorFeeBps} bps "${t.spec?.name}"`);
const one = must(await getTheme(t.themeId))!;
console.log(`getTheme members: ${one.members.map((m) => `${m.symbol} ${m.band.minBps}/${m.band.targetBps}/${m.band.maxBps} ref ${m.refPriceE18}`).join("; ")} · cash ${one.cash.minBps}/${one.cash.targetBps}/${one.cash.maxBps}`);
console.log(`spec hash on chain ${one.specHash} = keccak256(canonical data URI bytes) ${keccak256(specPayload(one.spec!).bytes)} → ${one.specHash === keccak256(specPayload(one.spec!).bytes)}`);
process.exit(0);
