"use client";
// The AI data-sharing consent (S13 step 8; D34, App Review 5.1.2(i)): before the first question, who receives it and
// what goes with it, named from the server's own configuration; nothing is sent until "Agree and ask". R4-3 (D-227): title,
// lead, recipients, two short lines and a "What's sent" link to /privacy's list, then the buttons (copy spec, step 3).
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { SENSEI } from "./copy";

export function SenseiConsent({ recipients, onAgree, onDecline }: { recipients: readonly string[]; onAgree: () => void; onDecline: () => void }) {
  const c = SENSEI.consent;
  return (
    <section aria-labelledby="sensei-consent" className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-1 p-4">
      <h3 id="sensei-consent" className="flex items-center gap-2 type-body-strong text-ink">
        <ShieldCheck aria-hidden className="size-4 text-accent" />
        {c.title}
      </h3>
      <p className="type-body text-ink">{c.lead}</p>
      <ul className="flex flex-col gap-1 pl-1">
        {recipients.map((r) => (
          <li key={r} className="type-body-strong text-ink">{r}</li>
        ))}
      </ul>
      <p className="type-caption text-ink-secondary">
        {c.what}{" "}
        <Link href={c.whatHref} className="text-ink underline underline-offset-2">{c.whatLink} →</Link>
      </p>
      <p className="type-caption text-ink-secondary">{c.not} {c.kept}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={onAgree} className="min-h-touch flex-1 rounded-full bg-accent-fill px-4 type-body-strong text-on-accent">{c.agree}</button>
        <button type="button" onClick={onDecline} className="min-h-touch rounded-full border border-hairline px-4 type-body-strong text-ink">{c.decline}</button>
      </div>
    </section>
  );
}
