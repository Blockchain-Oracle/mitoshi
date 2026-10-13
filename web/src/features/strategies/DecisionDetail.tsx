"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/{DecisionDetail.tsx,decision-copy.ts} (R4-6, D-227) — one
// decision, whole: the Window, the read (model, call, the why in full, and what paid for it — Mitoshi's MPP receipts, or
// "unpaid", D-218.4; the network is named only on the mode plate, D-228) or, for a rule's call (R6 #9), the rule and
// its trigger — nothing is paid for a rule — the ruling in words (`gate-words`, never the gate's raw line), the copies
// it placed (this strategy's fills on that Window) and how it settled. A centred dialog on desktop, a bottom sheet on a
// phone, on Base UI's Dialog.
import { Dialog } from "@base-ui/react/dialog";
import { isRuleModel, txUrl } from "@cwf/core";
import { XIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { webEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { usd, usdSigned } from "./format";
import { gateOf, whyOf } from "./gate-words";
import { shortAddress } from "./names";
import type { DecisionDetailWire, DecisionWire, FillWire } from "./protocol";
import "./decision.css";
import "./strategies.css";

export const DECISION = {
  open: "Open this decision",
  eyebrow: "Decision",
  close: "Close",
  model: (m: string) => `Model · ${m}`,
  noModel: "Model · not reported",
  latest: (n: number, total: number) => `latest ${n} of ${total}`,
  empty: "No reads yet.",
  sections: { window: "The Window", read: "The read", call: "The call", gate: "The gate", trigger: "Its trigger", trades: "Copies placed", settlement: "Settlement" },
  rows: { window: "Window", decided: "Decided", call: "Call", model: "Model", rule: "Rule", paid: "Paid", ruling: "Ruling", outcome: "Outcome" },
  rules: { momentum: "Momentum", reversion: "Mean reversion", mirror: "Copy a trader" } as Record<string, string>,
  unpaid: "unpaid",
  paid: (amount: string, host: string) => `${amount} · ${host}`,
  noTrades: "Nothing placed on this Window.",
  /** The runner says it filled, but those fills aren't in what this view read (the catalogue carries the latest only). */
  unlisted: (n: number) => `${n} placed · not listed here`,
  proof: "Print proof →",
  pending: "Not settled yet",
  outcome: { won: "won", lost: "lost", void: "void", open: "open" } as Record<string, string>,
  noAnswer: "no answer",
  held: "held",
  copied: (n: number) => `copied for ${n}`,
  notCopied: "not copied",
} as const;

export const callOf = (d: DecisionWire) => (d.verdictSide === "none" ? DECISION.noAnswer : `${d.verdictSide.toUpperCase()}${d.confidence !== null ? ` · ${d.confidence.toFixed(2)}` : ""}`);
/** An agent's gate ruling ("sent UP · 1 filled"); a rule's call is its side already, so only whether it was copied. */
export const rulingOf = (d: DecisionWire) =>
  isRuleModel(d.model) ? (d.filled > 0 ? DECISION.copied(d.filled) : DECISION.notCopied) : d.gate === "trade" && d.side ? `sent ${d.side.toUpperCase()}${d.filled > 0 ? ` · ${d.filled} filled` : ""}` : DECISION.held;
const when = (ms: number) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const receiptsOf = (d: DecisionWire | DecisionDetailWire) => ("receipts" in d ? d.receipts : undefined);

export function DecisionDetail({ decision, agentName, fills, onClose }: { decision: DecisionWire | DecisionDetailWire | null; agentName: string; fills: readonly FillWire[]; onClose: () => void }) {
  return (
    <Dialog.Root open={decision !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="decision-backdrop" />
        <Dialog.Popup className="decision-popup">
          <span className="decision-bar" aria-hidden />
          <Dialog.Close className="strat-drawer-close" aria-label={DECISION.close}><XIcon aria-hidden="true" /></Dialog.Close>
          {decision && <Body d={decision} agentName={agentName} fills={fills.filter((f) => f.marketId.toLowerCase() === decision.marketId.toLowerCase())} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body({ d, agentName, fills }: { d: DecisionWire | DecisionDetailWire; agentName: string; fills: readonly FillWire[] }) {
  const receipts = receiptsOf(d);
  const network = webEnv.markets.network;
  const rule = isRuleModel(d.model);
  const preset = d.model.slice("rule/".length);
  const why = whyOf(d);
  const ruling = gateOf(d);
  return (
    <>
      <p className="strat-meta mb-1.5 text-accent">{DECISION.eyebrow} · {agentName}</p>
      <Dialog.Title className="decision-title">{d.label ?? shortAddress(d.marketId)}</Dialog.Title>
      {d.outcome && <p className={cn("decision-outcome", `decision-outcome--${d.outcome}`)}>{DECISION.outcome[d.outcome]}</p>}
      <Section title={rule ? DECISION.sections.call : DECISION.sections.read}>
        <Row label={DECISION.rows.decided} value={when(d.decidedAtMs)} />
        <Row label={DECISION.rows.call} value={callOf(d)} />
        {rule ? <Row label={DECISION.rows.rule} value={DECISION.rules[preset] ?? preset} /> : <Row label={DECISION.rows.model} value={d.model} />}
        {!rule && receipts !== undefined && <Row label={DECISION.rows.paid} value={receipts ? receipts.map((r) => DECISION.paid(usd(BigInt(r.amountBase)), r.host)).join(", ") : DECISION.unpaid} />}
        {/* A read the model never answered says so here, once; its `why` is the error, never shown. */}
        <Dialog.Description className="decision-why">{why ?? ruling}</Dialog.Description>
      </Section>
      <Section title={rule ? DECISION.sections.trigger : DECISION.sections.gate}>
        <Row label={DECISION.rows.ruling} value={rulingOf(d)} accent={d.gate === "trade"} />
        {why !== null && ruling && <p className="decision-note">{ruling}</p>}
      </Section>
      <Section title={DECISION.sections.trades}>
        {fills.length === 0 ? <p className="decision-note">{d.gate === "trade" && d.filled > 0 ? DECISION.unlisted(d.filled) : DECISION.noTrades}</p> : fills.map((t) => (
          <div key={t.txHash} className="decision-trade">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("decision-side", t.side === "up" ? "decision-side--up" : "decision-side--down")}>{t.side.toUpperCase()}{t.mode === "fade" ? " · fade" : ""}</span>
              <span className="strat-mono-10 text-ink/40">{shortAddress(t.owner)}</span>
            </div>
            <dl className="decision-trade-facts">
              <div><dt>Stake</dt><dd>{usd(BigInt(t.cashDeltaBase))}</dd></div>
              <div><dt>P&amp;L</dt><dd>{t.pnlBase === null ? DECISION.outcome.open : usdSigned(BigInt(t.pnlBase))}</dd></div>
            </dl>
            <a className="decision-link" href={txUrl(t.txHash as `0x${string}`, network)} target="_blank" rel="noreferrer">{shortAddress(t.txHash)} ↗</a>
          </div>
        ))}
      </Section>
      <Section title={DECISION.sections.settlement}>
        <Row label={DECISION.rows.outcome} value={d.outcome && d.outcome !== "open" ? DECISION.outcome[d.outcome]! : DECISION.pending} />
        {d.outcome && d.outcome !== "open" && <Link className="decision-link" href={`/proof/${d.marketId}`}>{DECISION.proof}</Link>}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="decision-section">
      <h3 className="decision-section-title">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="decision-row">
      <span className="decision-row-label">{label}</span>
      <span className={cn("decision-row-value", accent && "text-accent")}>{value}</span>
    </div>
  );
}
