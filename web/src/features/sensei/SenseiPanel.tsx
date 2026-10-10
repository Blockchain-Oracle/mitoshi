"use client";
// Sensei (S13 step 8): whether it is on (`GET /api/sensei`), the consent before the first question, then the thread
// (21st 31661) with the starters, the follow-up chips and the composer (21st 12399). `read` hands over the figures on
// screen at the moment of asking, so every answer reads the live Window.
import { useEffect, useState } from "react";
import { notify } from "@/lib/toast";
import { consentCovers, grantAiConsent, useAiConsent, withdrawAiConsent } from "./consent";
import { chipsFor, SENSEI, SENSEI_STARTERS } from "./copy";
import type { SenseiContext, SenseiStatus } from "./protocol";
import { SenseiComposer } from "./SenseiComposer";
import { CopyAnswer, SenseiMessageRow, SenseiThread, StreamingCursor, TypingDots } from "./SenseiThread";
import { SenseiConsent } from "./SenseiConsent";
import { useSenseiChat } from "./useSenseiChat";

let statusOnce: Promise<SenseiStatus | null> | null = null;
const readStatus = () =>
  (statusOnce ??= fetch("/api/sensei", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<SenseiStatus>) : null))
    .catch(() => null)
    .then((s) => (s === null && (statusOnce = null), s)));

export function SenseiPanel({ read }: { read: () => SenseiContext }) {
  const [status, setStatus] = useState<SenseiStatus | null | "loading">("loading");
  const consent = useAiConsent();
  const provider = status !== "loading" && status?.on ? status.provider : null;
  const chat = useSenseiChat(provider);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => void readStatus().then(setStatus), []);

  const agreed = consentCovers(consent, provider);
  const ask = (q: string) => (agreed ? void chat.ask(q, read()) : setPending(q));
  const busy = chat.status !== "idle";
  const last = chat.messages.at(-1);

  if (status === "loading") return <p role="status" className="type-caption text-ink-secondary">{SENSEI.checking}</p>;
  if (status === null || !status.on) return <p className="rounded-lg border border-hairline bg-surface-1 p-4 type-body text-ink-secondary">{status === null ? SENSEI.offline : SENSEI.off}</p>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <SenseiThread label={SENSEI.title}>
        {chat.messages.map((m, i) => {
          const writing = i === chat.messages.length - 1 && m.role === "assistant" && busy;
          return (
            <SenseiMessageRow key={i} role={m.role} failed={m.failed}>
              {m.role === "user" ? m.content : (
                <>
                  {writing && chat.status === "waiting" ? <TypingDots /> : (
                    <p className="whitespace-pre-wrap break-words">{m.content}{writing ? <StreamingCursor /> : null}</p>
                  )}
                  {!writing && !m.failed && i > 0 && m.content ? <CopyAnswer text={m.content} /> : null}
                </>
              )}
            </SenseiMessageRow>
          );
        })}
      </SenseiThread>
      {pending !== null && !agreed ? (
        <SenseiConsent
          recipients={status.recipients}
          onAgree={() => {
            grantAiConsent(status.provider!);
            const q = pending;
            setPending(null);
            void chat.ask(q, read());
          }}
          onDecline={() => (setPending(null), notify.item({ id: "sensei-consent", title: SENSEI.consent.declined }))}
        />
      ) : null}
      {!busy && pending === null ? (
        <div className="flex flex-wrap gap-2" aria-label={SENSEI.title}>
          {(chat.messages.length <= 1 ? SENSEI_STARTERS : last?.role === "assistant" && !last.failed ? chipsFor(last.content) : []).map((q) => (
            <button key={q} type="button" onClick={() => ask(q)} className="min-h-touch rounded-full border border-hairline bg-surface-1 px-3 type-caption font-bold text-ink">{q}</button>
          ))}
        </div>
      ) : null}
      <SenseiComposer busy={busy} disabled={pending !== null} onSend={ask} onStop={chat.stop} />
      {agreed ? (
        <p className="flex flex-wrap items-center gap-x-2 type-caption text-ink-secondary">
          {SENSEI.shared(status.recipients.join(", then "))}
          <button type="button" className="min-h-touch underline" onClick={() => (withdrawAiConsent(), notify.item({ id: "sensei-consent", title: SENSEI.turnedOff }))}>{SENSEI.turnOff}</button>
        </p>
      ) : null}
    </div>
  );
}
