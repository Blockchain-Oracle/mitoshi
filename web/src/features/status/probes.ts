import "server-only";
/**
 * `/status`'s reads (S5; Masayume 68f7a09 `features/status/probes.server.ts`'s role): ops' own `/health` — every
 * keeper's last good pass and what it said — and the fee relay's balance, read at request time with a timeout. Each
 * row is what a dependency is doing now, in plain words; nothing here is operator copy.
 */
import { webEnv } from "@/lib/env";
import { relayHandler } from "@/server/relay";

export type Tone = "good" | "warn" | "bad";

export interface StatusRow {
  id: string;
  label: string;
  tone: Tone;
  /** "12 s ago", "head 38,966,735" — the row's figure. */
  figure: string;
  detail: string;
}

export interface StatusReport {
  checkedAtMs: number;
  overall: "healthy" | "degraded" | "unreachable";
  rows: StatusRow[];
}

interface Actor {
  actor: string;
  everyMs: number;
  lastOkMs: number | null;
  lastWhy?: string;
  critical: boolean;
  failing: boolean;
  detail?: Record<string, unknown>;
}

/** The keepers a reader of the product meets, in the order a Window meets them. */
const ROWS: readonly [string, string][] = [
  ["chain-head", "Tempo testnet"],
  ["indexer", "Indexer"],
  ["spot-feed", "Signed prices (RedStone)"],
  ["price-relay", "Opening and closing prints"],
  ["display-crypto", "Live line · crypto"],
  ["display-stocks", "Live line · stocks"],
  ["window-roller", "Window roller"],
  ["seed-maker", "House maker"],
  ["earn-quoter", "Maker vault quotes"],
  ["settler", "Settler and payouts"],
  ["exit-keeper", "Exit keeper"],
  ["leverage-keeper", "Boost keeper"],
  ["halt-watch", "Trading halts"],
  ["calendar", "Market calendar"],
  ["archive", "Print archive"],
];

const ago = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))} s ago` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min ago` : `${Math.round(ms / 3_600_000)} h ago`);
/** The actor's own sentence, up to its first " | " (the rest is a list of recent sends), kept short. */
const said = (why: string | undefined) => {
  // A display feed reports prices at 8 decimals ("BTC 8271804000000"): shown in dollars.
  const head = (why ?? "").split(" | ")[0]!.trim().replace(/\b([A-Z]{2,6}) (\d{9,})\b/g, (_, sym: string, e8: string) => `${sym} $${(Number(e8) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  return head.length > 140 ? `${head.slice(0, 139)}…` : head;
};

async function opsHealth(): Promise<{ nowMs: number; actors: Actor[] } | null> {
  const base = webEnv.markets.opsUrl;
  if (!base) return null;
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(5_000), cache: "no-store" });
    if (!res.ok && res.status !== 503) return null;
    return (await res.json()) as { nowMs: number; actors: Actor[] };
  } catch {
    return null;
  }
}

async function relayRow(): Promise<StatusRow> {
  try {
    const relay = relayHandler();
    const balance = await relay.balance();
    if (balance === null) return { id: "relay", label: "Fee relay", tone: "bad", figure: "—", detail: "Its balance can't be read, so it holds every sponsored fee until it can." };
    const usd = Number(balance) / 1e6;
    return { id: "relay", label: "Fee relay", tone: usd > 100 ? "good" : "warn", figure: `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, detail: "Pays your taps' network fees in pathUSD." };
  } catch {
    return { id: "relay", label: "Fee relay", tone: "bad", figure: "—", detail: "Not answering on this deployment: every trade asks its sender to pay the fee." };
  }
}

export async function readStatus(): Promise<StatusReport> {
  const checkedAtMs = Date.now();
  const [ops, relay] = await Promise.all([opsHealth(), relayRow()]);
  if (!ops) return { checkedAtMs, overall: "unreachable", rows: [relay] };
  const byName = new Map(ops.actors.map((a) => [a.actor, a]));
  const rows: StatusRow[] = [];
  for (const [name, label] of ROWS) {
    const a = byName.get(name);
    if (!a) continue;
    const age = a.lastOkMs === null ? Infinity : ops.nowMs - a.lastOkMs;
    const stale = age > Math.max(3 * a.everyMs, 120_000);
    const tone: Tone = a.failing || age === Infinity ? "bad" : stale ? "warn" : "good";
    const head = name === "chain-head" ? (a.detail?.head as number | undefined) : undefined;
    const figure = head ? `block ${head.toLocaleString("en-US")}` : a.lastOkMs === null ? "never" : ago(age);
    rows.push({ id: name, label, tone, figure, detail: said(a.lastWhy) });
  }
  rows.push(relay);
  const critical = new Set(ops.actors.filter((a) => a.critical).map((a) => a.actor));
  const degraded = rows.some((r) => r.tone === "bad" && (critical.has(r.id) || r.id === "relay"));
  return { checkedAtMs, overall: degraded ? "degraded" : "healthy", rows };
}
