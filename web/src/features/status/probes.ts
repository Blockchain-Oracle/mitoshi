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

export type Tone = "good" | "warn" | "bad";
export type StatusGroup = "Chain" | "Prices" | "Windows" | "Payouts" | "Markets" | "Fees" | "Bridge";

export interface StatusRow {
  id: string;
  /** The system it belongs to: Chain, Prices, Windows, Payouts, Markets, Fees, Bridge (R4-12's pathways and reserves). */
  group: StatusGroup;
  label: string;
  tone: Tone;
  /** "12 s ago", "head 38,966,735" — the row's figure. */
  figure: string;
  detail: string;
}

export interface StatusReport {
  checkedAtMs: number;
  overall: "healthy" | "degraded" | "unreachable";
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
  ["chain-head", "Tempo testnet", "Chain"],
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
    if (balance === null) return { id: "relay", group: "Fees", label: "Fee relay", tone: "bad", figure: "—", detail: "Balance unreadable." };
    const usd = Number(balance) / 1e6;
    return { id: "relay", group: "Fees", label: "Fee relay", tone: usd > 100 ? "good" : "warn", figure: `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, detail: "Pays tap fees." };
  } catch {
    return { id: "relay", group: "Fees", label: "Fee relay", tone: "bad", figure: "—", detail: "Down: trades pay their own fee." };
  }
}

interface BridgeDetail {
  lastDelivered?: Partial<Record<"in" | "out", number>>;
  medians?: Partial<Record<"in" | "out", { medianSec: number } | null>>;
  floats?: { ticker: string; balanceWei: string; onwardFeeWei: string }[];
}

const PATHWAY = { in: "Bridge · Robinhood → Base → Tempo", out: "Bridge · Tempo → Base → Robinhood" } as const;
const mins = (sec: number) => (sec < 120 ? `${sec} s` : `${Math.round(sec / 60)} min`);

/**
 * One row per bridge pathway (R4-12, D-227; S14 14o `/status` LayerZero probe), from ops `bridge-watch`: the last
 * delivery's age, the measured median and how many hops the Base floats can still pay; then reserve-watch's verdict.
 */
function bridgeRows(byName: Map<string, Actor>, nowMs: number): StatusRow[] {
  const out: StatusRow[] = [];
  const bw = byName.get("bridge-watch");
  if (bw) {
    const d = (bw.detail ?? {}) as BridgeDetail;
    const hops = (d.floats ?? []).map((f) => (BigInt(f.onwardFeeWei) > 0n ? Number(BigInt(f.balanceWei) / BigInt(f.onwardFeeWei)) : 0));
    const minHops = hops.length ? Math.min(...hops) : null;
    for (const dir of ["in", "out"] as const) {
      const last = d.lastDelivered?.[dir];
      const median = d.medians?.[dir]?.medianSec;
      const parts = [median !== undefined ? `median ${mins(median)}` : "no delivery measured yet", minHops !== null ? `Base float ${minHops} hop${minHops === 1 ? "" : "s"}` : null].filter(Boolean);
      out.push({ id: `bridge-${dir}`, group: "Bridge", label: PATHWAY[dir], tone: bw.failing ? "bad" : minHops !== null && minHops < 5 ? "warn" : "good", figure: last ? ago(nowMs - last) : "never", detail: parts.join(" · ") });
    }
  }
  const rw = byName.get("reserve-watch");
  if (rw) out.push({ id: "reserve-watch", group: "Bridge", label: "Reserves", tone: rw.failing ? "bad" : /ALERT/.test(rw.lastWhy ?? "") ? "warn" : "good", figure: rw.lastOkMs === null ? "never" : ago(nowMs - rw.lastOkMs), detail: said(rw.lastWhy) });
  return out;
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
    rows.push({ id: name, group, label, tone, figure, detail: said(a.lastWhy) });
  }
  rows.push(...bridgeRows(byName, ops.nowMs));
  rows.push(relay);
  const critical = new Set(ops.actors.filter((a) => a.critical).map((a) => a.actor));
  const degraded = rows.some((r) => r.tone === "bad" && (critical.has(r.id) || r.id === "relay"));
  return { checkedAtMs, overall: degraded ? "degraded" : "healthy", head: chainHead, rows };
}
