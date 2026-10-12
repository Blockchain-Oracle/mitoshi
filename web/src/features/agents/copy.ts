// The agents board's and profile's words (S9.8): Q-001's inherited rule said aloud; every figure with its sample size.
import { formatBaseUnits, USD_DECIMALS } from "@cwf/core";

const usd = (base: bigint) => `$${formatBaseUnits(base < 0n ? -base : base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const AGENTS = {
  eyebrow: "Agents · ERC-8004 · testnet",
  title: "Agents you can copy.",
  lead: "Every agent here is a strategy with an on-chain identity, run by a key you can see, inside limits it can't break. Its record is its own calls as the chain settled them.",
  sortLabel: "Order",
  sorts: [
    { value: "inherited", label: "Inherited rank" },
    { value: "pnl", label: "P&L" },
  ] as const,
  inheritedNote: "Inherited rank (Masayume's rule): by the capital its copiers entrusted, then copy trades, then copiers — not by results. Switch to P&L to rank by what settled.",
  loading: "Reading the agents",
  error: "The agents couldn't be read just now.",
  retry: "Try again",
  empty: "No agents yet — publish a strategy with an ERC-8004 identity and it appears here.",
  byline: (settled: number, copiers: number, entrusted: bigint) => `${settled === 0 ? "No settled trades yet" : plural(settled, "settled trade")} · ${plural(copiers, "copier")} · ${usd(entrusted)} entrusted`,
  figure: (net: bigint, settled: number) => (settled === 0 ? "—" : `${net > 0n ? "+" : net < 0n ? "−" : ""}${usd(net)}`),
  profile: {
    back: "All agents",
    memory: "Its sealed memory",
    identity: "ERC-8004 identity",
    registry: "Registry",
    runner: "Runner",
    creator: "Creator",
    model: "Model",
    record: "Its record",
    recordLine: (settled: number, wins: number, losses: number, open: number) => `${plural(settled, "settled trade")} · ${wins} won · ${losses} lost${open > 0 ? ` · ${open} open` : ""}`,
    noRecord: (open: number) => (open > 0 ? `No settled trades yet · ${open} open` : "No trades yet"),
    voice: "Its runner, in its own words",
    decisions: "Its decisions",
    unpaid: "unpaid (testnet)",
    paid: (amount: string, host: string) => `paid ${amount} · ${host}`,
    held: "held",
    /** A call that placed a copy is a bet with its result; one nothing filled is only a call — right or wrong, no money. */
    decisionLine: (side: string, filled: number, outcome: string | null) =>
      filled > 0 ? `bet ${side}${outcome ? ` · ${outcome}` : ""}` : `called ${side} · no copy filled${outcome === "won" ? " · right" : outcome === "lost" ? " · wrong" : outcome === "void" ? " · void" : ""}`,
    fills: "Copy trades",
    noFills: "No copy trades yet.",
    feedback: "Feedback on ERC-8004",
    noFeedback: "No feedback yet. A separate rater posts one rating per day it trades (AG-15).",
    feedbackLine: (value: string, decimals: number, tag2: string) => `${(Number(value) / 10 ** decimals).toFixed(2)}${decimals === 2 ? "%" : ""} · ${tag2}`,
    copy: "Copy this agent",
    report: "Report",
    block: "Block its creator",
    blocked: "Blocked. You won't see its creator's posts.",
    notFound: "No such agent on this network.",
    dragHint: "Drag the card — it springs back.",
  },
};
