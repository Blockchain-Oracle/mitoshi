"use client";
// The proof's one re-verify (R4-10, D-227; Owarine 90a91d71 `ReverifyChecks` rows on Agari 03b30ab's two checks, merged
// from Mitoshi's ReverifyButton and ArchiveVerifyButton): one press, in this browser, reads each record transaction and
// asks the print verifier again, and runs the same verifier on the packages archived for each instant. The button sits
// in the page head; its answers list as status rows under "Check it yourself" (green matches, red differs, grey can't
// check). viem and the archive read load on the press, not with the page.
import { RefreshCwIcon } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { PillButton } from "@/components/kit";
import type { ArchiveInput } from "./archive-verify";
import { PROOF } from "./copy";
import type { ReverifyInput } from "./reverify";

export type ProofCheck =
  | { id: string; label: string; kind: "record"; input: ReverifyInput; expectedE8: string }
  | { id: string; label: string; kind: "archive"; input: ArchiveInput; expectedE8: string | null }
  | { id: string; label: string; kind: "copied" };

type Tone = "good" | "warn" | "bad" | "off";
interface Answer {
  id: string;
  label: string;
  tone: Tone;
  value: string;
  detail: string;
}

const usd = (e8: bigint) => `$${(Number(e8) / 1e8).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
const firstLine = (e: unknown) => (e instanceof Error ? e.message.split("\n")[0]! : String(e));

async function answer(c: ProofCheck): Promise<Answer> {
  const base = { id: c.id, label: c.label };
  if (c.kind === "copied") return { ...base, tone: "off", value: PROOF.value.cant, detail: PROOF.copied };
  try {
    if (c.kind === "record") {
      const r = await (await import("./reverify")).reverifyPrint(c.input);
      const same = r.priceE8 === BigInt(c.expectedE8);
      return { ...base, tone: same ? "good" : "bad", value: same ? PROOF.value.matches : PROOF.value.differs, detail: PROOF.detail(usd(r.priceE8), r.signers) };
    }
    const r = await (await import("./archive-verify")).archiveReverify(c.input);
    if (r.kind === "missing") return { ...base, tone: "off", value: PROOF.value.cant, detail: PROOF.archive.missing };
    const why = r.kind === "refused" ? (PROOF.archive.reasons[r.reason] ?? r.reason) : "";
    // No print was recorded at this instant: the archive's answer explains the void (refused) or says what it would have been.
    if (c.expectedE8 === null) return r.kind === "refused" ? { ...base, tone: "warn", value: PROOF.value.refused, detail: why } : { ...base, tone: "warn", value: PROOF.value.wouldPrint, detail: PROOF.detail(usd(r.priceE8), r.signers) };
    if (r.kind === "refused") return { ...base, tone: "bad", value: PROOF.value.refused, detail: why };
    const same = r.priceE8 === BigInt(c.expectedE8);
    return { ...base, tone: same ? "good" : "bad", value: same ? PROOF.value.matches : PROOF.value.differs, detail: PROOF.detail(usd(r.priceE8), r.signers) };
  } catch (e) {
    return { ...base, tone: "off", value: PROOF.value.cant, detail: firstLine(e) };
  }
}

interface Ctx {
  busy: boolean;
  answers: Answer[] | null;
  atMs: number | null;
  run: () => void;
  total: number;
}
const VerifyCtx = createContext<Ctx | null>(null);

export function ProofVerify({ checks, children }: { checks: ProofCheck[]; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [atMs, setAtMs] = useState<number | null>(null);
  const run = useCallback(() => {
    setBusy(true);
    void Promise.all(checks.map(answer)).then((a) => {
      setAnswers(a);
      setAtMs(Date.now());
      setBusy(false);
    });
  }, [checks]);
  return <VerifyCtx.Provider value={{ busy, answers, atMs, run, total: checks.length }}>{children}</VerifyCtx.Provider>;
}

/** THE action on the page: one accent pill in the head. */
export function ReverifyAll() {
  const ctx = useContext(VerifyCtx);
  if (!ctx || ctx.total === 0) return null;
  return (
    <PillButton tone="accent" size="sm" onClick={ctx.run} disabled={ctx.busy} data-primary-action>
      <RefreshCwIcon aria-hidden className={ctx.busy ? "animate-spin" : undefined} />
      {ctx.busy ? PROOF.reverifying : PROOF.reverify}
    </PillButton>
  );
}

export function ReverifyResults() {
  const ctx = useContext(VerifyCtx);
  if (!ctx) return null;
  if (ctx.answers === null) return <p className="type-caption text-ink-secondary" role="status">{ctx.busy ? PROOF.reverifying : PROOF.check.idle}</p>;
  const pass = ctx.answers.filter((a) => a.tone === "good").length;
  return (
    <div className="flex flex-col gap-3">
      <p className="type-body-strong text-ink" role="status" aria-live="polite">
        {PROOF.verdictLine(pass, ctx.answers.length, ctx.atMs ? `${new Date(ctx.atMs).toISOString().slice(11, 19)} UTC` : "")}
      </p>
      <div className="status-table">
        <div className="status-table-body">
          {ctx.answers.map((a) => (
            <div key={a.id} className="status-row">
              <span className="status-dot" data-tone={a.tone} aria-hidden />
              <span className="status-row-label">{a.label}</span>
              <span className="status-row-lag" data-tone={a.tone}>{a.value}</span>
              <span className="status-row-detail">{a.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
