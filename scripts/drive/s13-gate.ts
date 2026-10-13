#!/usr/bin/env -S pnpm exec tsx
/**
 * S13's gate on testnet (D-207: the product checked live). Two people, each signing once:
 *  - a fresh key with no call: its one session covers a follow and a take; the $BTC room refuses its post;
 *  - the `keeper` house key (disclosed house activity, real taker fills on BTC): its session posts in the $BTC room —
 *    the gate passing on a real engine position;
 *  - the fresh key blocks the house key: the house message leaves its view of the room and stays in a visitor's;
 *  - it reports the house message (the queue); then both delete their off-chain data with a fresh signature, and the
 *    room, the take and the follow are gone.
 * Keys are read from ~/.config/cwf/testnet/ and never printed.
 *
 *   pnpm --dir scripts exec tsx drive/s13-gate.ts [--base https://mitoshi.xyz]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { deletionMessage, socialSessionMessage } from "@cwf/core";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);
const BASE = arg("--base", "https://mitoshi.xyz").replace(/\/$/, "");
const ROOM = encodeURIComponent("$BTC");
const results: { step: string; ok: boolean }[] = [];
const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, "0")).join("");

class Person {
  cookie = "";
  constructor(readonly account: PrivateKeyAccount) {}
  async call(path: string, init: RequestInit = {}) {
    const res = await fetch(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
    const set = res.headers.get("set-cookie");
    if (set?.startsWith("cwf_social=")) this.cookie = set.split(";")[0]!;
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }
  async signIn() {
    const text = socialSessionMessage({ address: this.account.address, network: "testnet", issuedAtSec: Math.floor(Date.now() / 1000), nonce: nonce() });
    return this.call("/api/social/session", { method: "POST", body: JSON.stringify({ text, signature: await this.account.signMessage({ message: text }) }) });
  }
  async deleteData() {
    const text = deletionMessage({ address: this.account.address, network: "testnet", issuedAtSec: Math.floor(Date.now() / 1000), nonce: nonce() });
    return this.call("/api/account/data", { method: "DELETE", body: JSON.stringify({ text, signature: await this.account.signMessage({ message: text }) }) });
  }
}

function check(step: string, status: number, want: number, note?: unknown) {
  results.push({ step, ok: status === want });
  console.log(JSON.stringify({ step, status, want, ok: status === want, ...(note === undefined ? {} : { note }) }));
}
const visitor = new Person(privateKeyToAccount(generatePrivateKey()));
const messages = async (p: Person) => ((await p.call(`/api/social/rooms/${ROOM}`)).body.messages as { id: string; author: string }[] | undefined) ?? [];

const keeper = JSON.parse(readFileSync(join(homedir(), ".config/cwf/testnet/keeper.json"), "utf8")) as { privateKey: `0x${string}` };
const house = new Person(privateKeyToAccount(keeper.privateKey));
const probe = new Person(privateKeyToAccount(generatePrivateKey()));

check("a fresh key signs once", (await probe.signIn()).status, 200);
check("the same session follows", (await probe.call("/api/social/follow", { method: "POST", body: JSON.stringify({ address: house.account.address }) })).status, 200);
const markets = await fetch(`${BASE}/api/index/markets?live=${Math.floor(Date.now() / 1000)}&limit=500`, { signal: AbortSignal.timeout(60_000) }).then((r) => r.json() as Promise<{ rows: { market: string; symbol: string; state: string; lock_at_sec: string }[] }>);
const live = markets.rows.find((m) => m.symbol === "BTC" && m.state === "open" && Number(m.lock_at_sec) > Date.now() / 1000 + 60);
const take = live ? await probe.call("/api/social/takes", { method: "POST", body: JSON.stringify({ marketId: live.market, side: "up", caption: "S13 gate: one session, a follow and a take" }) }) : { status: 0, body: {} };
check("and posts a take", take.status, 201, (take.body.take as { id?: string } | undefined)?.id);
check("the $BTC room refuses a key with no call", (await probe.call(`/api/social/rooms/${ROOM}`, { method: "POST", body: JSON.stringify({ body: "no call here" }) })).status, 403);

check("the house key signs once", (await house.signIn()).status, 200);
const posted = await house.call(`/api/social/rooms/${ROOM}`, { method: "POST", body: JSON.stringify({ body: "S13 gate check (house key, real BTC fills) — removed after the check" }) });
check("the $BTC room seats a key with real engine fills", posted.status, 201);
const houseAddr = house.account.address.toLowerCase();
const seenBefore = (await messages(probe)).some((m) => m.author === houseAddr);
check("the follower sees the house message", seenBefore ? 200 : 404, 200);

check("the follower blocks the house key", (await probe.call("/api/social/block", { method: "POST", body: JSON.stringify({ address: house.account.address }) })).status, 200);
check("the blocked author leaves the blocker's room", (await messages(probe)).some((m) => m.author === houseAddr) ? 409 : 200, 200);
check("a visitor still sees it", (await messages(visitor)).some((m) => m.author === houseAddr) ? 200 : 404, 200);
const houseMsg = (await messages(visitor)).find((m) => m.author === houseAddr);
check("a report reaches the queue", (await probe.call("/api/social/report", { method: "POST", body: JSON.stringify({ targetKind: "comment", targetId: houseMsg?.id ?? "0", reason: "spam", note: "S13 gate check" }) })).status, 201);

const houseGone = await house.deleteData();
check("the house key deletes its off-chain data", houseGone.status, 200, houseGone.body.deleted);
const probeGone = await probe.deleteData();
check("the fresh key deletes its off-chain data", probeGone.status, 200, probeGone.body.deleted);
check("the room no longer holds the house message", (await messages(visitor)).some((m) => m.author === houseAddr) ? 409 : 200, 200);
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ step: "done", checks: results.length, failed: failed.length }));
process.exitCode = failed.length ? 1 : 0;
