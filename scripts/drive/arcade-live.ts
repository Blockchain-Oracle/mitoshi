#!/usr/bin/env -S pnpm exec tsx
/**
 * The arcade board live (D-226), with a fresh throwaway key — no funds, no chain writes: the board hands out an 8-hex
 * seed; a run is played on that seed with the engine the browser runs (no inputs: the dot holds, the line moves away,
 * the grip runs out); a post without a session is refused; one signature buys the session; the run is accepted after
 * the server's replay and ranked; a score the replay doesn't reproduce is refused; the board lists the wallet.
 *
 *   pnpm --dir scripts exec tsx drive/arcade-live.ts [--base https://mitoshi.xyz]
 */
import { isArcadeSeed, replayRide, ticksToMs } from "@cwf/core/games/arcade";
import { socialSessionMessage } from "@cwf/core";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);
const BASE = arg("--base", "https://mitoshi.xyz").replace(/\/$/, "");
const account = privateKeyToAccount(generatePrivateKey());
let cookie = "";
let failed = 0;

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
  const set = res.headers.get("set-cookie");
  if (set?.startsWith("cwf_social=")) cookie = set.split(";")[0]!;
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function check(step: string, ok: boolean, note: unknown) {
  if (!ok) failed++;
  console.log(JSON.stringify({ step, ok, note }));
}

const board = await call("/api/games/arcade/board?game=line-rider");
const seed = String(board.body.seed);
check("the board hands out an 8-hex seed", board.status === 200 && isArcadeSeed(seed) && board.body.configured === true, { status: board.status, seed, configured: board.body.configured });

const run = replayRide(seed, [], { calm: false });
const claim = { game: "line-rider", seed, engineVersion: board.body.engineVersion, durationMs: ticksToMs(run.ticks), score: run.score, calm: false, trace: [] as number[] };
check("the run ends on its own", run.ended, { score: run.score, ticks: run.ticks });

const anon = await call("/api/games/arcade/score", { method: "POST", body: JSON.stringify(claim) });
check("a post without a session is refused", anon.status === 401, anon);

const text = socialSessionMessage({ address: account.address, network: "testnet", issuedAtSec: Math.floor(Date.now() / 1000), nonce: "a1b2c3d4e5f60718293a" });
const signIn = await call("/api/social/session", { method: "POST", body: JSON.stringify({ text, signature: await account.signMessage({ message: text }) }) });
check("one signature buys the session", signIn.status === 200 && cookie !== "", { status: signIn.status });

const forged = await call("/api/games/arcade/score", { method: "POST", body: JSON.stringify({ ...claim, score: claim.score + 1 }) });
check("a score the replay doesn't reproduce is refused", forged.status === 422, forged);

const posted = await call("/api/games/arcade/score", { method: "POST", body: JSON.stringify(claim) });
check("the replayed run is accepted and ranked", posted.status === 200 && typeof posted.body.rank === "number", { status: posted.status, rank: posted.body.rank, isBest: posted.body.isBest });

const after = await call(`/api/games/arcade/board?game=line-rider&address=${account.address}`);
const me = after.body.me as { best: number; rank: number } | null;
check("the board names the wallet's best", me?.best === run.score, me);

console.log(failed === 0 ? "arcade-live: all checks passed" : `arcade-live: ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
