#!/usr/bin/env -S pnpm exec tsx
/**
 * rpc-load (S3 fix, D-130): replays the venue actors' boundary read load through `createOpsClient` against the real RPC
 * and counts what fails. Several read-only clients (one per actor, as ops runs them in one process) each re-list every
 * Series and read every Window the relay tracks (8 back per Series), all at once, for `--rounds` rounds. Signs nothing.
 *
 *   pnpm --dir scripts exec tsx drive/rpc-load.ts [--actors 5] [--rounds 5] [--rpc https://rpc.moderato.tempo.xyz]
 */
import { createOpsClient, fetchMarkets, listSeries, marketIdOf, venueOf } from "@cwf/markets/ops";

const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1]! : fallback);
const ACTORS = Number(arg("--actors", "5"));
const ROUNDS = Number(arg("--rounds", "5"));
const RPC = arg("--rpc", process.env.TEMPO_RPC_HTTP_URL ?? "");

const clients = Array.from({ length: ACTORS }, () => createOpsClient({ network: "testnet", ...(RPC ? { rpcUrl: RPC } : {}) }));
const venue = venueOf(clients[0]!.chainId)!;
const failures = new Map<string, number>();
let ok = 0;
let reads = 0;

async function actorRound(i: number): Promise<void> {
  const client = clients[i]!;
  try {
    const series = await listSeries(client, venue);
    const ids = series.flatMap((s) => Array.from({ length: Number(s.nextIndex < 9n ? s.nextIndex : 9n) }, (_, k) => marketIdOf(s.seriesId, s.nextIndex - 1n - BigInt(k))));
    const views = await fetchMarkets(client, venue, ids);
    reads += ids.length;
    if (views.some((v) => v === null)) throw new Error("a Window read came back empty");
    ok++;
  } catch (error) {
    const text = (error instanceof Error ? (error as { shortMessage?: string }).shortMessage ?? error.message : String(error)).split("\n")[0]!.slice(0, 120);
    failures.set(text, (failures.get(text) ?? 0) + 1);
  }
}

const started = Date.now();
for (let r = 0; r < ROUNDS; r++) await Promise.all(clients.map((_, i) => actorRound(i)));
const total = ACTORS * ROUNDS;
console.log(`${total} actor passes (${ACTORS} clients × ${ROUNDS} rounds), ${reads} Window reads, ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(`ok ${ok}/${total}`);
for (const [why, n] of failures) console.log(`failed ${n}: ${why}`);
process.exit(ok === total ? 0 : 1);
