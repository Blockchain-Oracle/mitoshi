#!/usr/bin/env -S pnpm exec tsx
/**
 * The social layer live (S13, D-207: the product checked live), with a fresh throwaway key — no funds, no chain writes:
 * a visitor reads a room; a write without a session is refused; one signature buys the 30-day session; the room's
 * position gate refuses an address with no call; the profile takes a name; a take posts on a live TSLA Window (takes
 * need no call — "backed" says whether there is one); a reaction and a report land; the session signs out.
 *
 *   pnpm --dir scripts exec tsx drive/social-live.ts [--base https://testnet.mitoshi.xyz]
 */
import { socialSessionMessage } from "@cwf/core";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const arg = (n: string, d: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1]! : d);
const BASE = arg("--base", "https://testnet.mitoshi.xyz").replace(/\/$/, "");
const account = privateKeyToAccount(generatePrivateKey());
let cookie = "";
const results: { step: string; status: number; ok: boolean; note?: string }[] = [];

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
  const set = res.headers.get("set-cookie");
  if (set?.startsWith("cwf_social=")) cookie = set.split(";")[0]!;
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

function check(step: string, status: number, want: number, note?: string) {
  results.push({ step, status, ok: status === want, ...(note ? { note } : {}) });
  console.log(JSON.stringify({ step, status, want, ok: status === want, ...(note ? { note } : {}) }));
}

const room = encodeURIComponent("$TSLA");
const read = await call(`/api/social/rooms/${room}`);
check("a visitor reads the TSLA room", read.status, 200, `${(read.body.messages as unknown[] | undefined)?.length ?? "?"} messages`);
check("a post without a session is refused", (await call(`/api/social/rooms/${room}`, { method: "POST", body: JSON.stringify({ body: "hello" }) })).status, 401);

const text = socialSessionMessage({ address: account.address, network: "testnet", issuedAtSec: Math.floor(Date.now() / 1000), nonce: "0123456789abcdef0123" });
const signIn = await call("/api/social/session", { method: "POST", body: JSON.stringify({ text, signature: await account.signMessage({ message: text }) }) });
check("one signature buys the session", signIn.status, 200, cookie ? "cwf_social set" : "no cookie");
const who = await call("/api/social/session");
check("the session names the address", who.status, 200, String(who.body.address === account.address.toLowerCase()));

const gated = await call(`/api/social/rooms/${room}`, { method: "POST", body: JSON.stringify({ body: "hello from a fresh key" }) });
check("the room's gate refuses an address with no call", gated.status, 403, String(gated.body.message));

const name = `probe_${account.address.slice(2, 8)}`;
check("the profile takes a public name", (await call("/api/social/profile", { method: "PUT", body: JSON.stringify({ displayName: name, bio: "S13 live check" }) })).status, 200, name);

const markets = await fetch(`${BASE}/api/index/markets?live=${Math.floor(Date.now() / 1000)}&limit=500`, { signal: AbortSignal.timeout(60_000) }).then((r) => r.json() as Promise<{ rows: { market: string; symbol: string; state: string; lock_at_sec: string }[] }>);
const now = Math.floor(Date.now() / 1000);
const live = markets.rows.find((m) => m.symbol === "TSLA" && m.state === "open" && Number(m.lock_at_sec) > now + 60);
if (!live) {
  console.log(JSON.stringify({ step: "no live TSLA Window to post a take on", ok: false }));
} else {
  const take = await call("/api/social/takes", { method: "POST", body: JSON.stringify({ marketId: live.market, side: "up", caption: "S13 live check: $TSLA $NVDA" }) });
  const t = take.body.take as { id: string; backed: boolean; tags: string[] } | undefined;
  check("a take posts on a live Window", take.status, 201, t ? `id ${t.id}, backed ${t.backed}, tags ${t.tags.join(",")}` : String(take.body.message));
  if (t) {
    check("a reaction lands", (await call("/api/social/react", { method: "POST", body: JSON.stringify({ target: "take", id: t.id, kind: "fire", on: true }) })).status, 200);
    const feed = await call("/api/social/takes?symbol=NVDA");
    check("the take is filed under its cashtags", feed.status, 200, String((feed.body.takes as { id: string }[]).some((x) => x.id === t.id)));
    check("a report reaches the queue", (await call("/api/social/report", { method: "POST", body: JSON.stringify({ targetKind: "take", targetId: t.id, reason: "spam", note: "S13 live check — dismiss" }) })).status, 201);
  }
}
check("signing out clears the session", (await call("/api/social/session", { method: "DELETE" })).status, 200);
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ step: "done", address: account.address, checks: results.length, failed: failed.length }));
process.exitCode = failed.length ? 1 : 0;
