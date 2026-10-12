"use client";
// The archive half of a proof (S5 gate, G-10): one press takes the RedStone packages ops archived for this instant and
// asks the same verifier, in this browser. For a recorded print it should match the record; for a print that never
// landed it names why, in the verifier's own words (too few signers, wrong instant…).
import { ArchiveIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import type { ArchiveInput } from "./archive-verify";
import { PROOF } from "./copy";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; text: string } | { kind: "note"; text: string } | { kind: "bad"; text: string };

const usd = (e8: bigint) => `$${(Number(e8) / 1e8).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;

export function ArchiveVerifyButton({ input, expectedE8 }: { input: ArchiveInput; expectedE8: string | null }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const A = PROOF.archive;
  const run = async () => {
    setState({ kind: "busy" });
    try {
      const { archiveReverify } = await import("./archive-verify");
      const r = await archiveReverify(input);
      if (r.kind === "missing") setState({ kind: "note", text: A.missing });
      else if (r.kind === "refused") setState({ kind: expectedE8 === null ? "note" : "bad", text: A.refused(r.archived, A.reasons[r.reason] ?? r.reason) });
      else if (expectedE8 === null) setState({ kind: "note", text: A.wouldPrint(usd(r.priceE8), r.signers) });
      else setState(r.priceE8 === BigInt(expectedE8) ? { kind: "ok", text: A.matches(usd(r.priceE8), r.signers) } : { kind: "bad", text: PROOF.differs(usd(r.priceE8)) });
    } catch (e) {
      setState({ kind: "bad", text: PROOF.failed(e instanceof Error ? e.message.split("\n")[0]! : String(e)) });
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => void run()} disabled={state.kind === "busy"} className="inline-flex min-h-touch items-center gap-2 self-start rounded-full border border-hairline px-4 type-body-strong text-ink disabled:opacity-60">
        <ArchiveIcon aria-hidden className={`size-4${state.kind === "busy" ? " animate-pulse" : ""}`} />
        {state.kind === "busy" ? A.checking : A.button}
      </button>
      <p role="status" aria-live="polite" className="type-caption text-ink-secondary">
        {state.kind === "ok" ? <span className="inline-flex items-start gap-1.5 text-ink"><ShieldCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />{state.text}</span> : null}
        {state.kind === "note" ? <span className="text-ink">{state.text}</span> : null}
        {state.kind === "bad" ? <span className="inline-flex items-start gap-1.5 text-warning"><TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />{state.text}</span> : null}
      </p>
    </div>
  );
}
