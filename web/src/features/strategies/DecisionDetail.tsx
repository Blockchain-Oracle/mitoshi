"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/{DecisionDetail.tsx,decision-copy.ts} (R4-6, D-227) — one
// agent decision, whole: the Window, the read (model, call, the why in full, and what paid for it — Mitoshi's MPP
// receipts, or "unpaid · testnet", D-218.4), the gate's ruling, the copies it placed (this strategy's fills on that
// Window) and how it settled. A centred dialog on desktop, a bottom sheet on a phone, on Base UI's Dialog.
import { Dialog } from "@base-ui/react/dialog";
import { txUrl } from "@cwf/core";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { webEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { usd, usdSigned } from "./format";
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
  empty: "No reads yet.",
  sections: { window: "The Window", read: "The read", gate: "The gate", trades: "Copies placed", settlement: "Settlement" },
  rows: { window: "Window", decided: "Decided", call: "Call", model: "Model", paid: "Paid", ruling: "Ruling", outcome: "Outcome" },
  unpaid: "unpaid · testnet",
  paid: (amount: string, host: string) => `${amount} · ${host}`,
  noTrades: "Nothing placed on this Window.",
  pending: "Not settled yet",
  outcome: { won: "won", lost: "lost", void: "void", open: "open" } as Record<string, string>,
  noAnswer: "no answer",
  held: "held",
} as const;

export const callOf = (d: DecisionWire) => (d.verdictSide === "none" ? DECISION.noAnswer : `${d.verdictSide.toUpperCase()}${d.confidence !== null ? ` · ${d.confidence.toFixed(2)}` : ""}`);
export const rulingOf = (d: DecisionWire) => (d.gate === "trade" && d.side ? `sent ${d.side.toUpperCase()}${d.filled > 0 ? ` · ${d.filled} filled` : ""}` : DECISION.held);
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
  return (
    <>
      <p className="strat-meta mb-1.5 text-accent">{DECISION.eyebrow} · {agentName}</p>
      <Dialog.Title className="decision-title">{d.label ?? shortAddress(d.marketId)}</Dialog.Title>
      {d.outcome && <p className={cn("decision-outcome", `decision-outcome--${d.outcome}`)}>{DECISION.outcome[d.outcome]}</p>}
      <Section title={DECISION.sections.read}>
        <Row label={DECISION.rows.decided} value={when(d.decidedAtMs)} />
        <Row label={DECISION.rows.call} value={callOf(d)} />
        <Row label={DECISION.rows.model} value={d.model} />
        {receipts !== undefined && <Row label={DECISION.rows.paid} value={receipts ? receipts.map((r) => DECISION.paid(usd(BigInt(r.amountBase)), r.host)).join(", ") : DECISION.unpaid} />}
        <Dialog.Description className="decision-why">“{d.why}”</Dialog.Description>
      </Section>
      <Section title={DECISION.sections.gate}>
        <Row label={DECISION.rows.ruling} value={rulingOf(d)} accent={d.gate === "trade"} />
        {d.gateReason && <p className="decision-note">{d.gateReason}</p>}
      </Section>
      <Section title={DECISION.sections.trades}>
        {fills.length === 0 ? <p className="decision-note">{DECISION.noTrades}</p> : fills.map((t) => (
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
