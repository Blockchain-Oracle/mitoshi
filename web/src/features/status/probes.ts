import "server-only";
/**
 * `/status`'s reads (S5; Masayume 68f7a09 `features/status/probes.server.ts`'s role): ops' own `/health` — every
 * keeper's last good pass and what it said — and the fee relay's balance, read at request time with a timeout. Each
 * row is what a dependency is doing now, in plain words; nothing here is operator copy. R4-10 (D-227): each row names
 * its system (Owarine's board groups checks by the system they watch) and the report carries the chain's head, the
 * banner's big figure.
 */
import { webEnv } from "@/lib/env";
import { relayHandler } from "@/server/relay";
import { overallOf } from "./grade";
import { rowDetail } from "./rows-copy";

/** `wait`: expected and not yet possible (a keeper with nothing to do until something lands) — never "live" (T15). */
export type Tone = "good" | "wait" | "warn" | "bad";
export type StatusGroup = "Chain" | "Prices" | "Windows" | "Payouts" | "Markets" | "Fees";

export interface StatusRow {
  id: string;
  /** The system it belongs to: Chain, Prices, Windows, Payouts, Markets, Fees. */
  group: StatusGroup;
  label: string;
  tone: Tone;
  /** "12 s ago", "head 38,966,735" — the row's figure. */
  figure: string;
  detail: string;
}

export interface StatusReport {
  checkedAtMs: number;
  overall: "healthy" | "waiting" | "degraded" | "unreachable";
  /** Tempo's head block as the chain-head keeper last read it; null when it didn't say. */
  head: number | null;
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
const ROWS: readonly [string, string, StatusGroup][] = [
  ["chain-head", "Tempo chain", "Chain"],
  ["indexer", "Indexer", "Chain"],
  ["spot-feed", "Signed prices (RedStone)", "Prices"],
  ["price-relay", "Opening and closing prints", "Prices"],
  ["display-crypto", "Live line · crypto", "Prices"],
  ["display-stocks", "Live line · stocks", "Prices"],
  ["archive", "Print archive", "Prices"],
  ["window-roller", "Window roller", "Windows"],
  ["seed-maker", "House maker", "Windows"],
  ["earn-quoter", "Maker vault quotes", "Windows"],
  ["settler", "Settler and payouts", "Payouts"],
  ["exit-keeper", "Exit keeper", "Payouts"],
  ["leverage-keeper", "Boost keeper", "Payouts"],
  ["halt-watch", "Trading halts", "Markets"],
  ["calendar", "Market calendar", "Markets"],
];

const ago = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))} s ago` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min ago` : `${Math.round(ms / 3_600_000)} h ago`);
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
    if (balance === null) return { id: "relay", group: "Fees", label: "Fee relay", tone: "bad", figure: "—", detail: "Balance unreadable." };
    const usd = Number(balance) / 1e6;
    return { id: "relay", group: "Fees", label: "Fee relay", tone: usd > 100 ? "good" : "warn", figure: `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, detail: "Pays tap fees." };
  } catch {
    return { id: "relay", group: "Fees", label: "Fee relay", tone: "bad", figure: "—", detail: "Down: trades pay their own fee." };
  }
}

export async function readStatus(): Promise<StatusReport> {
  const checkedAtMs = Date.now();
  const [ops, relay] = await Promise.all([opsHealth(), relayRow()]);
  if (!ops) return { checkedAtMs, overall: "unreachable", head: null, rows: [relay] };
  const byName = new Map(ops.actors.map((a) => [a.actor, a]));
  const rows: StatusRow[] = [];
  let chainHead: number | null = null;
  for (const [name, label, group] of ROWS) {
    const a = byName.get(name);
    if (!a) continue;
    const age = a.lastOkMs === null ? Infinity : ops.nowMs - a.lastOkMs;
    const stale = age > Math.max(3 * a.everyMs, 120_000);
    const tone: Tone = a.failing || age === Infinity ? "bad" : stale ? "warn" : "good";
    const head = name === "chain-head" ? (a.detail?.head as number | undefined) : undefined;
    if (head) chainHead = head;
    const figure = head ? `block ${head.toLocaleString("en-US")}` : a.lastOkMs === null ? "never" : ago(age);
    rows.push({ id: name, group, label, tone, figure, detail: rowDetail(name, a.detail, a.lastWhy) });
  }
  rows.push(relay);
  const critical = new Set(ops.actors.filter((a) => a.critical).map((a) => a.actor));
  return { checkedAtMs, overall: overallOf(rows, critical), head: chainHead, rows };
}
