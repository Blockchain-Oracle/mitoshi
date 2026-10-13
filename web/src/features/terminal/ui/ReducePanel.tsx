"use client";
// Reduce, redone (round 7: the owner didn't like it — each chip sold the moment it was tapped, with no idea what it
// paid). Pick a part, see what it pays and what keeps riding, then hold to cash out. The preview scales what Close pays
// now for the whole position (an estimate, so "≈"); the sale reads its own exit for that size and, if the price moved,
// asks again with the new figure (useTerminalClose's requote). A Boost sells whole, so it offers All only.
import { useState } from "react";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { SHELL } from "@/lib/copy";
import { tapFeedback } from "@/lib/feedback";
import { TERMINAL } from "../copy";
import { money } from "../format";
import type { TerminalPosition } from "../terminal-positions";

const PARTS = [25n, 50n, 75n, 100n] as const;
type Part = (typeof PARTS)[number];

export function ReducePanel({ p, valueBase, tradable, busy, masked, onReduce }: {
  p: TerminalPosition;
  /** What Close pays now for the whole position (base units), or null while unknown. */
  valueBase: bigint | null;
  tradable: boolean;
  busy: boolean;
  masked: boolean;
  onReduce: (p: TerminalPosition, sellRaw: bigint) => void;
}) {
  const parts: readonly Part[] = p.boost ? [100n] : PARTS;
  const [part, setPart] = useState<Part>(p.boost ? 100n : 50n);
  const R = TERMINAL.reduce;
  const gets = valueBase === null ? null : (valueBase * part) / 100n;
  const keeps = valueBase === null || part === 100n ? null : valueBase - (gets ?? 0n);
  const show = (base: bigint) => (masked ? SHELL.masked : money(base, false, p.decimals));
  return (
    <div className="tm-field tm-reduce">
      <span className="tm-field-head">{TERMINAL.details.reduce}</span>
      <div className="tm-choices" role="radiogroup" aria-label={TERMINAL.details.reduce}>
        {parts.map((pct) => (
          <button
            key={String(pct)}
            type="button"
            role="radio"
            aria-checked={part === pct}
            className="tm-choice"
            disabled={busy || !tradable}
            onClick={() => (tapFeedback(), setPart(pct))}
          >
            {pct === 100n ? R.all : `${pct}%`}
          </button>
        ))}
      </div>
      <p className="tm-reduce-line type-caption" aria-live="polite">
        {gets === null ? R.unknown : part === 100n ? R.closes(show(gets)) : R.splits(show(gets), show(keeps ?? 0n))}
      </p>
      <HoldToConfirm
        duration={700}
        disabled={busy || !tradable || gets === null}
        confirmLabel={part === 100n ? R.holdAll : R.holdPart}
        onConfirm={() => onReduce(p, (p.heldRaw * part) / 100n)}
      >
        {gets === null ? R.cashOut : R.cashOutFor(show(gets))}
      </HoldToConfirm>
    </div>
  );
}
