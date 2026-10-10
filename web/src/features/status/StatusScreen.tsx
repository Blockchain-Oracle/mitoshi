// `/status` (S5, L-16; Masayume 68f7a09 `features/status`'s banner + one row per dependency, its dot ladder): read at
// request time from ops' `/health` and the fee relay, in the docs' type.
import { CheckCircleIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { H1, Lead, Note, Table } from "@/features/docs/Prose";
import { readStatus, type Tone } from "./probes";

const DOT: Record<Tone, string> = { good: "bg-up", warn: "bg-warning", bad: "bg-down" };
const TONE_WORD: Record<Tone, string> = { good: "Running", warn: "Behind", bad: "Not running" };

export async function StatusScreen() {
  await connection();
  const s = await readStatus();
  const healthy = s.overall === "healthy";
  return (
    <>
      <H1>Status</H1>
      <Lead>Is everything running? Each row is a part of Mitoshi on Tempo testnet and what it last did, read just now.</Lead>
      <div className="flex items-start gap-3 rounded-lg border border-hairline bg-surface-1 p-4">
        {healthy ? <CheckCircleIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-up" /> : <TriangleAlertIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />}
        <p className="type-body text-ink">
          {s.overall === "healthy" ? "All systems running." : s.overall === "degraded" ? "Something is behind: see the rows marked red." : "The keepers' health can't be read right now; the chain and the app may still be fine."}
        </p>
      </div>
      <Table
        head={["", "Part", "Last", "What it says"]}
        rows={s.rows.map((r) => [
          <span key="d" role="img" aria-label={TONE_WORD[r.tone]} className={`inline-block size-2.5 rounded-full ${DOT[r.tone]}`} />,
          // The halt-watch row opens the halts board (S6): every ticker's halts over 30 days.
          r.id === "halt-watch" ? <Link key="l" href="/status/halts" className="font-bold underline underline-offset-2">{r.label}</Link> : <b key="l">{r.label}</b>,
          <span key="f" className="whitespace-nowrap tabular-nums">{r.figure}</span>,
          <span key="w" className="type-caption text-ink-secondary">{r.detail}</span>,
        ])}
      />
      <Note>Checked {new Date(s.checkedAtMs).toISOString().replace("T", " ").slice(0, 19)} UTC. Reload for a fresh read.</Note>
    </>
  );
}
