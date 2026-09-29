/**
 * Spike X10 (plan C.5.3, D-033): the UNPAID 402 probe. Sends each MPP request with no credential and prints what the
 * server asks for — intents (charge vs session), currency, amount, chain, fee sponsorship. Pays nothing, signs nothing.
 *
 *   tsx scripts/mpp/probe.ts [--fixture]     # --fixture saves the raw challenges for the parser test
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { probeMpp } from "@cwf/markets/server";

const body = (model: string) => JSON.stringify({ model, max_tokens: 16, messages: [{ role: "user", content: "hi" }] });
const post = (model: string): RequestInit => ({ method: "POST", headers: { "content-type": "application/json", "anthropic-version": "2023-06-01" }, body: body(model) });
const indexer = (chainId: string) => `https://api.tempo.xyz/v1/indexer/query?${new URLSearchParams({ sql: "SELECT num FROM blocks ORDER BY num DESC LIMIT 1", chainId })}`;

const targets: { name: string; url: string; init?: RequestInit }[] = [
  { name: "anthropic sonnet", url: "https://anthropic.mpp.tempo.xyz/v1/messages", init: post("claude-sonnet-4-5") },
  { name: "anthropic opus-5", url: "https://anthropic.mpp.tempo.xyz/v1/messages", init: post("claude-opus-5") },
  { name: "anthropic haiku", url: "https://anthropic.mpp.tempo.xyz/v1/messages", init: post("claude-haiku-4-5") },
  { name: "openai gpt-4o-mini", url: "https://openai.mpp.tempo.xyz/v1/chat/completions", init: post("gpt-4o-mini") },
  { name: "tempo indexer testnet", url: indexer("42431") },
  { name: "tempo indexer mainnet", url: indexer("4217") },
  { name: "mpp.dev ping (testnet)", url: "https://mpp.dev/api/ping/paid" },
];

const fixture: Record<string, { status: number; wwwAuthenticate: string | null }> = {};
for (const t of targets) {
  const probe = await probeMpp(t.url, t.init, async (input, init) => {
    const r = await fetch(input, init);
    fixture[t.name] = { status: r.status, wwwAuthenticate: r.headers.get("www-authenticate") };
    return r;
  });
  console.log(`\n${t.name} — ${probe.status} charge=${probe.chargeOffered} session=${probe.sessionOffered}`);
  for (const o of probe.offers) {
    console.log(`  ${o.intent.padEnd(7)} ${o.amountBase} base of ${o.currency} on ${o.chainId}${o.feePayer ? " (fee sponsored)" : ""}${o.escrow ? ` escrow ${o.escrow} deposit ${o.suggestedDepositBase}` : ""} → ${o.recipient} "${o.description ?? ""}"`);
  }
}
if (process.argv.includes("--fixture")) {
  const path = join(import.meta.dirname, "..", "..", "packages/markets/src/mpp/x10.fixture.json");
  writeFileSync(path, `${JSON.stringify({ probedAt: new Date().toISOString(), responses: fixture }, null, 2)}\n`);
  console.log(`\nfixture → ${path}`);
}
