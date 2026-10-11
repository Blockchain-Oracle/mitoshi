/**
 * S9.9 live: the Memory Market on Moderato through the deployed web (L-56). The house creator (the `strategy-runner`
 * key, which published the house strategies) seals each house strategy's notes at a signed price; then, against the
 * live routes and the live chain:
 *  - the catalogue lists each memory's title, length and price, never its body;
 *  - a copier (the `s9-subscribe` wallet, live on #1 and #2) signs a read and gets it;
 *  - a stranger (a fresh key) signing the same request is refused with 402 and the fee;
 *  - the stranger, funded by the faucet, buys one read of #1 over MPP with the agents' own payer (`createMppPayer`,
 *    a pathUSD transfer to the creator) and gets it with a Payment-Receipt;
 *  - the same payment credential presented again opens nothing;
 *  - #3 (sealed copiers-only) offers no paid read.
 * Keys are read from ~/.config/cwf/testnet/ and the wallet file and never printed.
 *
 *   pnpm --dir scripts exec tsx drive/s9-memory.ts --subscriber <cast wallet new --json file> [--origin https://testnet.mitoshi.xyz]
 */
import { readFileSync } from "node:fs";
import { getAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { readMemoryMessage, sealMemoryMessage } from "@cwf/core";
import { PATH_USD, tempoReadClient } from "@cwf/markets";
import { createMppPayer } from "@cwf/markets/server";
import { strategyVenueOf } from "@cwf/markets/strategies";
import { loadRole } from "../v4/lib";

const argv = process.argv.slice(2);
const flag = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const origin = flag("--origin") ?? "https://testnet.mitoshi.xyz";
const subscriberFile = flag("--subscriber");
if (!subscriberFile) throw new Error("usage: s9-memory.ts --subscriber <wallet file> [--origin …]");
const client = tempoReadClient("testnet", process.env.TEMPO_RPC_HTTP_URL);
const venue = strategyVenueOf(42431)!;
const creator = loadRole("strategy-runner");
const subscriber = privateKeyToAccount((JSON.parse(readFileSync(subscriberFile, "utf8")) as { data: { private_key: Hex }[] }).data[0]!.private_key);
const strangerKey = generatePrivateKey();
const stranger = privateKeyToAccount(strangerKey);

/** What the house has learned, from the index's own measurements (D-220) and how each strategy is built. */
const NOTES: Record<string, { title: string; priceBase: bigint; body: string }> = {
  "1": {
    title: "BTC Momentum: what its trigger is sized from",
    priceBase: 100_000n,
    body: [
      "Sized from 24 h of BTC's five-minute Windows (280 of them, the index's own prints, 2026-10-11): the median Window moved 1.65 bps open to close, p75 3.42, p90 4.97, max 14.49.",
      "At its first trigger (20 bps) it never fired. At 3 bps it acts on roughly the top quarter of moves, and most often late in a Window, once the move has had time to build.",
      "How to read a call: it bets that the move since the opening print carries to the close. It buys the side the price already favours, so it usually pays more than 50¢ a share, and most near the end of a Window.",
      "It holds whenever BTC sits inside ±3 bps of the open. Copy it with a per-trade cap you are comfortable losing in full; fading it turns it into a reversion bet on BTC.",
    ].join("\n\n"),
  },
  "2": {
    title: "ETH Mean-reversion: what its trigger is sized from",
    priceBase: 100_000n,
    body: [
      "Sized from 24 h of ETH's five-minute Windows (280 of them, the index's own prints, 2026-10-11): the median Window moved 2.85 bps open to close, p75 5.03, p90 7.50, max 36.38.",
      "At its first trigger (30 bps) it never fired. At 5 bps it acts on roughly the top quarter of moves, betting the other side: a pullback before the close.",
      "How to read a call: it buys the side the price is moving away from, so it usually pays less than 50¢ a share. It loses when a run keeps going — ETH's tail is long (a 36 bps Window in the sample).",
      "Fading it (copy in fade mode) turns it into momentum on ETH.",
    ].join("\n\n"),
  },
  "3": {
    title: "House agent: how it decides",
    priceBase: 0n,
    body: [
      "It reads each BTC five-minute Window once, in its decision slot: the opening print, the move so far and both books. The slot is reserved before the model is asked, so a Window is never read twice.",
      "A fixed gate (posture: guarded) holds any call the model makes without conviction; a hold is recorded with its reason like any other decision.",
      "Every decision is recorded before anything is sent, with what paid for the model call: an MPP receipt, or \"unpaid\" on testnet, where the AI hosts don't charge.",
    ].join("\n\n"),
  },
};

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
};

async function signedRead(id: string, reader: PrivateKeyAccount) {
  const issuedAtMs = Date.now();
  const signature = await reader.signMessage({ message: readMemoryMessage({ network: "testnet", strategyId: id, reader: reader.address, issuedAtMs }) });
  return post("/api/strategies/memory/read", { strategyId: id, reader: reader.address, issuedAtMs, signature });
}

const report: Record<string, unknown> = { origin, creator: creator.address, subscriber: subscriber.address, stranger: stranger.address };

// 1. Seal (the creator the chain names for each id).
for (const [id, note] of Object.entries(NOTES)) {
  const s = (await client.readContract({ address: venue.strategyRegistry, abi: strategyRegistryAbi, functionName: "strategyOf", args: [BigInt(id)] })) as { creator: Address };
  if (getAddress(s.creator) !== getAddress(creator.address)) throw new Error(`#${id} was not published by the house creator`);
  const issuedAtMs = Date.now();
  const signature = await creator.signMessage({ message: sealMemoryMessage({ network: "testnet", strategyId: id, creator: creator.address, issuedAtMs, title: note.title, readPriceBase: note.priceBase, body: note.body }) });
  const res = await post("/api/strategies/memory", { strategyId: id, creator: creator.address, issuedAtMs, title: note.title, readPriceBase: note.priceBase.toString(), body: note.body, signature });
  report[`seal#${id}`] = res.status;
  if (res.status !== 200) throw new Error(`seal #${id}: ${res.status} ${JSON.stringify(res.json)}`);
}

// 2. The catalogue: title, length, price — never the body.
const catalogue = (await (await fetch(`${origin}/api/strategies`, { cache: "no-store" })).json()) as { strategies: { strategyId: string; memory: unknown }[] };
const listed = catalogue.strategies.filter((s) => NOTES[s.strategyId]).map((s) => ({ id: s.strategyId, memory: s.memory }));
report.listed = listed;
if (JSON.stringify(listed).includes("index's own prints")) throw new Error("the catalogue carries a body");

// 3. A copier reads; a stranger is refused.
const copier = await signedRead("1", subscriber);
report.copierRead = { status: copier.status, title: copier.json?.title };
const refused = await signedRead("1", stranger);
report.strangerSigned = { status: refused.status, error: refused.json?.error, feeBase: refused.json?.feeBase };

// 4. The stranger buys one read over MPP (the agents' payer: a pathUSD charge to the creator), capturing the credential.
await client.request({ method: "tempo_fundAddress" as never, params: [stranger.address] as never });
for (let i = 0; i < 20 && ((await client.readContract({ address: PATH_USD, abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }], functionName: "balanceOf", args: [stranger.address] })) as bigint) === 0n; i++) await new Promise((r) => setTimeout(r, 1_000));
let credential: string | null = null;
const capturing: typeof fetch = async (input, init) => {
  const h = new Headers(init?.headers);
  if (h.get("authorization")?.startsWith("Payment ")) credential = h.get("authorization");
  return fetch(input, init);
};
const payer = createMppPayer({
  network: "testnet",
  privateKey: strangerKey,
  caps: { chainIds: [42431], currencies: { [PATH_USD.toLowerCase()]: { perRequestBase: 1_000_000n, perDayBase: 1_000_000n } }, intents: ["charge"], recipients: [getAddress(creator.address)] },
  fetch: capturing,
});
const paid = await payer.fetch(`${origin}/api/strategies/1/memory`);
const paidJson = (await paid.json().catch(() => null)) as { title?: string } | null;
report.paidRead = { status: paid.status, title: paidJson?.title, receipt: paid.headers.get("payment-receipt") ? "present" : "missing", credentialCaptured: credential !== null };

// 5. The same credential again opens nothing.
if (credential) {
  const replay = await fetch(`${origin}/api/strategies/1/memory`, { headers: { authorization: credential }, cache: "no-store" });
  report.replay = { status: replay.status, opened: replay.ok };
}

// 6. Copiers-only: no paid read on offer.
report.copiersOnly = (await fetch(`${origin}/api/strategies/3/memory`, { cache: "no-store" })).status;

console.log(JSON.stringify(report, null, 2));
