"use client";
// Ported from Owarine 90a91d71:web/src/components/shell/app/HealthChip.tsx (P0, D-222): the network and its health as
// one dot and a word — the `/status` verdict, polled every 30 s while the tab is visible — and a link to the page.
import Link from "next/link";
import { useEffect, useState } from "react";
import { SHELL } from "@/lib/copy";
import { STATUS } from "@/features/status/copy";
import { worstTally } from "@/features/status/grade";
import type { StatusRow } from "@/features/status/probes";

type Overall = keyof typeof SHELL.health;
type Chip = { state: Overall | "wait" | "warn" | "bad"; word: string };
const POLL_MS = 30_000;

/** The worst tone alone ("2 behind"), else the verdict's word (R6 shell T15: it said healthy over two rows behind). */
function chipOf(b: { overall?: string; rows?: Pick<StatusRow, "tone">[] } | null): Chip {
  if (!b?.overall || !(b.overall in SHELL.health)) return { state: "unreachable", word: SHELL.health.unreachable };
  if (b.overall === "healthy" || b.overall === "unreachable") return { state: b.overall, word: SHELL.health[b.overall] };
  const worst = worstTally(b.rows ?? []);
  return worst ? { state: worst.tone, word: `${worst.n} ${STATUS.tally[worst.tone]}` } : { state: b.overall as Overall, word: SHELL.health[b.overall as Overall] };
}

export function HealthChip({ className }: { className?: string }) {
  const [chip, setChip] = useState<Chip>({ state: "unread", word: SHELL.health.unread });
  useEffect(() => {
    let alive = true;
    const read = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => alive && setChip(chipOf(b)))
        .catch(() => alive && setChip({ state: "unreachable", word: SHELL.health.unreachable }));
    };
    read();
    const t = setInterval(read, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return (
    <Link href="/status" className={`health-chip ${className ?? ""}`} data-state={chip.state} title={chip.word}>
      <span aria-hidden className="health-dot" />
      <span className="health-net">{SHELL.network}</span>
      <span className="health-word">· {chip.word}</span>
    </Link>
  );
}
