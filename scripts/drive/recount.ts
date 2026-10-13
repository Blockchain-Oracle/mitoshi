#!/usr/bin/env -S pnpm exec tsx
// Adapted from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:scripts/drive/recount.ts (--source chain): an independent
// replay of the chain diffed against what the index serves, with exact integers.
/**
 * recount (S3 gate "recount == index"): walks every engine log from the deploy block to a pinned head with its own
 * `eth_getLogs` + ABI decode (nothing read from the database), replays Windows, prints, fills, sets and redemptions,
 * and diffs the totals and every Window's digest against ops `GET /index/recount?through=<head>`. The index also holds
 * every Trading Balance's logs — the current EventVaultV2, each v2 it replaced (D-213) and v1 (S7, D-161) — so each is
 * walked and counted by name too, decoded with this script's own ABI list. Log windows follow what the RPC accepts: it
 * refuses more than 20,000 results and names a range that fits (D-187). Exit 1 on any mismatch.
 *
 *   pnpm --dir scripts exec tsx drive/recount.ts [--ops https://ops.mitoshi.xyz] [--rpc https://rpc.moderato.tempo.xyz]
 */
import { createPublicClient, decodeEventLog, getAddress, parseAbi, type Address, type Hex, type Log } from "viem";
import { tempoModerato } from "viem/chains";
import { deployments } from "@cwf/clients";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { tempoHttp, vaultVenuesOf, walkLogWindows } from "@cwf/markets/ops";

const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1]! : fallback);
const OPS = arg("--ops", "https://ops.mitoshi.xyz").replace(/\/$/, "");
const RPC = arg("--rpc", process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz");

const client = createPublicClient({ chain: tempoModerato, transport: tempoHttp(RPC) });
const frag = (deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string; deployBlock: number }> }>>)["42431"]!.engine!;
const ENGINE = getAddress(frag.contracts.EventsEngine!.address);
const DEPLOY = BigInt(frag.contracts.EventsEngine!.deployBlock);
const VAULTS = vaultVenuesOf(tempoModerato.id);
/** v2's events are v1's plus `ExitGranted`; the first v2 emitted it without D-213's slack (told apart by topic0). */
const VAULT_ABI = [...eventVaultV2Abi, ...parseAbi(["event ExitGranted(uint256 indexed grantId, address indexed owner, address indexed actor, bytes32 market, uint64 expiresAtSec, uint16 toleranceBps)"])];

/** Every log of `address` in `[from, to]`, in windows the RPC accepts. */
async function logsOf(address: Address, from: bigint, to: bigint, onLogs: (logs: Log[]) => void): Promise<void> {
  const stats = await walkLogWindows(from, to, async (a, b) => onLogs(await client.getLogs({ address, fromBlock: a, toBlock: b })), {
    onRefused: (a, b, why) => console.log(`  ${address.slice(0, 10)} ${a}-${b} refused: ${why.split("\n")[0]}`),
  });
  console.log(`  ${address.slice(0, 10)} blocks ${from}-${to}: ${stats.windows} windows, ${stats.refused} refused`);
}

type Market = { state: string; winner: number | null; openE8: string; closeE8: string; fills: number; fillLots: bigint; prints: number; redeemed: bigint; yes: Map<string, bigint>; no: Map<string, bigint> };
const markets = new Map<string, Market>();
const m = (id: string): Market => {
  let x = markets.get(id);
  if (!x) markets.set(id, (x = { state: "open", winner: null, openE8: "", closeE8: "", fills: 0, fillLots: 0n, prints: 0, redeemed: 0n, yes: new Map(), no: new Map() }));
  return x;
};
const add = (map: Map<string, bigint>, k: string, v: bigint) => map.set(k, (map.get(k) ?? 0n) + v);

async function main() {
  const head = (await client.getBlockNumber()) - 3n;
  const byName: Record<string, number> = {};
  let fills = 0;
  let fillLots = 0n;
  let redemptions = 0;
  let redeemedBase = 0n;
  let opened = 0;
  let logs = 0;
  let vaultLogs = 0;
  for (const vault of VAULTS) {
    await logsOf(vault.vault, vault.deployBlock, head, (found) => {
      for (const log of found) {
        let name: string;
        try {
          name = decodeEventLog({ abi: VAULT_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] }).eventName;
        } catch {
          continue; // the indexer stores only the vault's decodable events
        }
        vaultLogs++;
        byName[name] = (byName[name] ?? 0) + 1;
      }
    });
  }
  await logsOf(ENGINE, DEPLOY, head, (found) => {
    for (const log of found) {
      logs++;
      const e = decodeEventLog({ abi: eventsEngineAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      const a = e.args as Record<string, unknown>;
      byName[e.eventName] = (byName[e.eventName] ?? 0) + 1;
      const id = typeof a.marketId === "string" ? a.marketId.toLowerCase() : null;
      if (!id) continue;
      const w = m(id);
      switch (e.eventName) {
        case "WindowOpened":
          opened++;
          break;
        case "PrintRecorded":
          w.prints++;
          break;
        case "Fill": {
          const lots = a.lots as bigint;
          fills++;
          fillLots += lots;
          w.fills++;
          w.fillLots += lots;
          for (const [who, kind] of [[String(a.taker).toLowerCase(), Number(a.takerKind)], [String(a.maker).toLowerCase(), Number(a.makerKind)]] as const) {
            if (kind === 0) add(w.yes, who, lots);
            if (kind === 1) add(w.yes, who, -lots);
            if (kind === 2) add(w.no, who, lots);
            if (kind === 3) add(w.no, who, -lots);
          }
          break;
        }
        case "CompleteSet": {
          const who = String(a.owner).toLowerCase();
          const lots = (a.minted ? 1n : -1n) * (a.lots as bigint);
          add(w.yes, who, lots);
          add(w.no, who, lots);
          break;
        }
        case "Redeemed": {
          const who = String(a.holder).toLowerCase();
          add(w.yes, who, -(a.yesLots as bigint));
          add(w.no, who, -(a.noLots as bigint));
          redemptions++;
          redeemedBase += a.total as bigint;
          w.redeemed += a.total as bigint;
          break;
        }
        case "WindowResolved":
          w.state = Number(a.state) === 1 ? "resolved" : "voided";
          w.winner = Number(a.winner);
          w.openE8 = String(a.openE8);
          w.closeE8 = String(a.closeE8);
          break;
      }
    }
  });
  // Wait for the index to hold everything at or below the pinned head.
  type Served = { counts: Record<string, unknown>; markets: Array<Record<string, unknown>>; cursors: Array<{ address?: string; block: string }> };
  let served = null as Served | null;
  for (let i = 0; i < 30; i++) {
    // ~30 s at 1.8M events (countsThrough ~28 s, the digest ~4 s, F-S5-02): an offline gate tool can wait for it.
    const res = await fetch(`${OPS}/index/recount?through=${head}`, { signal: AbortSignal.timeout(300_000) });
    if (res.ok) {
      served = (await res.json()) as Served;
      const at = (a: string | undefined) => served!.cursors?.find((c) => c.address?.toLowerCase() === a?.toLowerCase());
      // Every source the index follows must have reached the pinned head (the engine and every vault).
      if ([ENGINE, ...VAULTS.map((v) => v.vault)].every((a) => at(a) && BigInt(at(a)!.block) >= head)) break;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  if (!served) throw new Error(`ops ${OPS} did not answer /index/recount`);
  const c = served.counts;
  const mismatches: string[] = [];
  const eq = (what: string, chain: unknown, index: unknown) => void (String(chain) !== String(index) && mismatches.push(`${what}: chain ${chain} ≠ index ${index}`));
  eq("events", logs + vaultLogs, c.events);
  eq("fills", fills, c.fills);
  eq("fill lots", fillLots, c.fill_lots);
  eq("windows opened", opened, c.windows_opened);
  eq("windows resolved", [...markets.values()].filter((x) => x.state !== "open").length, c.windows_resolved);
  eq("prints", byName.PrintRecorded ?? 0, c.prints);
  eq("redemptions", redemptions, c.redemptions);
  eq("redeemed base", redeemedBase, c.redeemed_base);
  eq("markets with seq gaps", 0, c.markets_with_gaps);
  const idxByName = (c.by_name ?? {}) as Record<string, number>;
  for (const name of new Set([...Object.keys(byName), ...Object.keys(idxByName)])) eq(`event ${name}`, byName[name] ?? 0, idxByName[name] ?? 0);
  const digests = new Map(served.markets.map((r) => [String(r.market), r]));
  for (const [id, w] of markets) {
    const d = digests.get(id);
    if (!d) {
      mismatches.push(`market ${id}: missing from the index`);
      continue;
    }
    const sum = (map: Map<string, bigint>) => [...map.values()].reduce((s, v) => s + v, 0n);
    eq(`${id.slice(0, 10)} state`, w.state, d.state);
    eq(`${id.slice(0, 10)} winner`, w.winner ?? "null", d.winner ?? "null");
    eq(`${id.slice(0, 10)} fills`, w.fills, d.fills);
    eq(`${id.slice(0, 10)} fill lots`, w.fillLots, d.fill_lots);
    eq(`${id.slice(0, 10)} prints`, w.prints, d.prints);
    eq(`${id.slice(0, 10)} redeemed`, w.redeemed, d.redeemed_base);
    // Live position sums are current state: compared only for Windows with nothing after the pinned head.
    if (!d.touched_after) {
      eq(`${id.slice(0, 10)} open YES lots`, sum(w.yes), d.open_yes_lots);
      eq(`${id.slice(0, 10)} open NO lots`, sum(w.no), d.open_no_lots);
    }
    if (w.state !== "open") {
      eq(`${id.slice(0, 10)} open print`, w.openE8, d.open_e8);
      eq(`${id.slice(0, 10)} close print`, w.closeE8, d.close_e8);
    }
  }
  console.log(`recount through block ${head}: ${logs} engine logs + ${vaultLogs} vault logs, ${markets.size} Windows (${opened} opened, ${[...markets.values()].filter((x) => x.state !== "open").length} terminal), ${fills} fills / ${fillLots} lots, ${byName.PrintRecorded ?? 0} prints, ${redemptions} redemptions / ${redeemedBase} base`);
  console.log(mismatches.length === 0 ? "recount: OK — the index equals an independent chain replay, total for total and Window for Window" : `recount: MISMATCH\n  - ${mismatches.join("\n  - ")}`);
  process.exitCode = mismatches.length === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
