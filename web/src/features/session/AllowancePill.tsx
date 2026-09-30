"use client";
// From 21st.dev 1600 haydenbleasel/pill (reused — the header's pill grammar: status · label, rounded, 44 px) — the
// persistent allowance pill of E.5 S7 / UX-06: "Tap-trading · $18/$25 left · 6 h". Only this leaf reads the shared
// clock (§3.2), so a second tick re-renders the pill and nothing above it. It warns before expiry (< 30 min, or less
// than one tap left) with a one-tap fix beside it; a tap on the pill opens the manager (a centred modal, lazy).
import { Zap } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useNowMs } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { leftNowBase, topUpBase, usd } from "./caps";
import { SESSION } from "./copy";
import { useSessionView } from "./context";
import { useSessionWrites } from "./useSessionWrites";

const SessionManagerBody = dynamic(() => import("./SessionManager").then((m) => m.SessionManagerBody), { ssr: false });
const WARN_SEC = 30 * 60;

export function useSessionModal() {
  const [open, setOpen] = useState(false);
  const modal = open ? (
    <Modal open={open} onOpenChange={setOpen} eyebrow={SESSION.eyebrow} title={SESSION.manager.title} description={SESSION.manager.description}>
      <SessionManagerBody />
    </Modal>
  ) : null;
  return { open: () => setOpen(true), modal };
}

/** The pill; renders nothing unless the Trading Balance has a session grant (live, expiring, expired or keyless). */
export function AllowancePill({ compact = false, className }: { compact?: boolean; className?: string }) {
  const view = useSessionView();
  const nowMs = useNowMs();
  const { open, modal } = useSessionModal();
  const w = useSessionWrites();
  const grant = view.grant;
  if (!grant || view.status === "disarmed" || view.status === "loading" || view.status === "no-wallet" || view.status === "not-passkey") return null;
  const nowSec = Math.floor((nowMs || Date.now()) / 1000);
  const secLeft = grant.expiresAtSec - nowSec;
  const left = leftNowBase(grant, nowSec);
  const expired = view.status === "expired" || secLeft < 0;
  const needsKey = view.status === "grant-without-key";
  const soon = !expired && secLeft < WARN_SEC;
  const low = !expired && left < grant.caps.maxStakePerTradeBase;
  const warn = expired || needsKey || soon || low;
  const figure = expired ? SESSION.pill.expired : needsKey ? SESSION.pill.needsKey : SESSION.pill.left(usd(left), usd(grant.caps.maxDailySpendBase));
  const time = expired || needsKey ? null : SESSION.timeLeft(secLeft);
  const title = SESSION.pill.title(usd(left), new Date(grant.expiresAtSec * 1000).toLocaleString());
  const fix = expired ? { label: SESSION.pill.renew, run: () => void w.extend() } : soon ? { label: SESSION.manager.extend(SESSION.expiries.h24), run: () => void w.extend() } : low ? { label: SESSION.manager.addBudget(usd(topUpBase(grant))), run: () => void w.addBudget() } : null;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={open}
        title={title}
        aria-label={`${SESSION.pill.label}: ${figure}${time ? `, ${time} left` : ""}. ${SESSION.pill.open}`}
        className={cn("inline-flex min-h-touch items-center gap-2 rounded-full border px-3 type-caption", warn ? "border-warning text-ink" : "border-border-strong text-ink")}
      >
        <Zap aria-hidden className={cn("size-3.5", warn ? "text-warning" : "text-accent")} />
        {compact ? null : <span className="border-r border-hairline pr-2 font-semibold">{SESSION.pill.label}</span>}
        <span className="numbers">{figure}</span>
        {time ? <span className="numbers text-ink-secondary">· {time}</span> : null}
      </button>
      {fix && !compact ? (
        <button type="button" onClick={fix.run} disabled={w.busy !== null} aria-busy={w.busy !== null} className="min-h-touch rounded-full bg-accent-fill px-3 type-caption font-semibold text-on-accent disabled:opacity-60">
          {w.busy !== null ? SESSION.busy : fix.label}
        </button>
      ) : null}
      {soon && !compact ? <span className="sr-only" role="status">{SESSION.warnSoon(SESSION.timeLeft(secLeft))}</span> : null}
      {modal}
    </span>
  );
}
