"use client";
// The proof's re-verification (Agari 03b30ab `features/proof/ReverifyButton.tsx`'s role): one press reads the record
// transaction and asks the verifier again, in this browser, and says whether the answer matches the recorded print.
import { RefreshCwIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { PROOF } from "./copy";
import type { ReverifyInput } from "./reverify";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; text: string } | { kind: "bad"; text: string };

const usd = (e8: bigint) => `$${(Number(e8) / 1e8).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;

export function ReverifyButton({ input, expectedE8 }: { input: ReverifyInput; expectedE8: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const run = async () => {
    setState({ kind: "busy" });
    try {
      const { reverifyPrint } = await import("./reverify");
      const r = await reverifyPrint(input);
      setState(r.priceE8 === BigInt(expectedE8) ? { kind: "ok", text: PROOF.verified(usd(r.priceE8), r.signers) } : { kind: "bad", text: PROOF.differs(usd(r.priceE8)) });
    } catch (e) {
      setState({ kind: "bad", text: PROOF.failed(e instanceof Error ? e.message.split("\n")[0]! : String(e)) });
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => void run()} disabled={state.kind === "busy"} className="inline-flex min-h-touch items-center gap-2 self-start rounded-full border border-hairline px-4 type-body-strong text-ink disabled:opacity-60">
        <RefreshCwIcon aria-hidden className={`size-4${state.kind === "busy" ? " animate-spin" : ""}`} />
        {state.kind === "busy" ? PROOF.reverifying : PROOF.reverify}
      </button>
      <p role="status" aria-live="polite" className="type-caption text-ink-secondary">
        {state.kind === "ok" ? <span className="inline-flex items-start gap-1.5 text-ink"><ShieldCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />{state.text}</span> : null}
        {state.kind === "bad" ? <span className="inline-flex items-start gap-1.5 text-warning"><TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />{state.text}</span> : null}
        {state.kind === "idle" || state.kind === "busy" ? PROOF.how : null}
      </p>
    </div>
  );
}
