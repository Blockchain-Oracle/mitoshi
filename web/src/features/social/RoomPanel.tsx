"use client";
// From 21st.dev 26900 rmahammad/comment-thread, revamped per D-044 for S13's rooms: its message row (avatar, name, time,
// body), its reaction chips (count, aria-pressed, the picker) and its optimistic send states (sending · failed · retry)
// are kept; threads, @mentions, edit/resolve/delete and motion's portal are not (a room is one flat conversation, and
// the terminal's drawer carries no motion runtime). Avatars are initials on the address hue; tokens throughout. The
// composer sits in the sheet's pinned footer (R4-2, D-227, Owarine 90a91d71 kit/Sheet `footer`), so a phone's keyboard
// lifts it and the draft never hides under the keys.
import { MoreHorizontal, SmilePlus } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SheetFooter } from "@/components/ui/drawer";
import { addressHue } from "@/lib/address-hue";
import { notify } from "@/lib/toast";
import { SOCIAL } from "./copy";
import { REACTIONS } from "./reactions";
import { ReportDialog } from "./report-dialog-lazy";
import { useSocialSession } from "./session";
import { useRoom, type RoomMessage } from "./useRoom";

const MAX = 280;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function Avatar({ address }: { address: string }) {
  return (
    <span aria-hidden className="grid size-8 flex-none place-items-center rounded-full text-xs font-bold text-white" style={{ background: `hsl(${addressHue(address)} 55% 42%)` } as CSSProperties}>
      {address.slice(2, 4).toUpperCase()}
    </span>
  );
}

function Message({ m, me, onReact, onRetry, onReport, onBlock }: { m: RoomMessage; me: string | null; onReact: (kind: (typeof REACTIONS)[number]["kind"], on: boolean) => void; onRetry: () => void; onReport: () => void; onBlock: () => void }) {
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState(false);
  const who = m.name ?? short(m.author);
  const mine = me === m.author;
  const shown = REACTIONS.filter((r) => (m.reactions.counts[r.kind] ?? 0) > 0);
  return (
    <li className="flex gap-2 py-2" aria-busy={m.local?.state === "sending" || undefined}>
      <Avatar address={m.author} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate type-body-strong text-ink">{mine ? `${who} (${SOCIAL.room.you})` : who}</span>
          <span className="type-caption text-ink-secondary">{m.local?.state === "sending" ? SOCIAL.room.sending : clock(m.createdAtMs)}</span>
          {!m.local && !mine ? (
            <span className="relative ml-auto">
              <button type="button" aria-label={SOCIAL.menu.open} title={SOCIAL.menu.open} aria-expanded={menu} onClick={() => setMenu((v) => !v)} className="grid size-touch place-items-center rounded-full text-ink-secondary hover:text-ink">
                <MoreHorizontal aria-hidden className="size-4" />
              </button>
              {menu ? (
                <span role="menu" className="absolute right-0 top-full z-10 flex min-w-40 flex-col rounded-md border border-hairline bg-surface-1 p-1 shadow-lg">
                  <button type="button" role="menuitem" className="min-h-11 rounded px-3 text-left type-body hover:bg-surface-2" onClick={() => (setMenu(false), onReport())}>{SOCIAL.menu.report}</button>
                  <button type="button" role="menuitem" className="min-h-11 rounded px-3 text-left type-body hover:bg-surface-2" onClick={() => (setMenu(false), onBlock())}>{SOCIAL.menu.block(who)}</button>
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap break-words type-body text-ink">{m.body}</p>
        {m.local?.state === "failed" ? (
          <p className="flex items-center gap-2 type-caption text-warning" role="alert">
            {m.local.error ?? SOCIAL.room.failed}
            <button type="button" className="min-h-11 underline" onClick={onRetry}>{SOCIAL.room.retry}</button>
          </p>
        ) : null}
        {!m.local ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {shown.map((r) => {
              const n = m.reactions.counts[r.kind] ?? 0;
              const on = m.reactions.mine.includes(r.kind);
              return (
                <button key={r.kind} type="button" aria-pressed={on} onClick={() => onReact(r.kind, !on)} className={`inline-flex min-h-touch items-center gap-1 rounded-full border px-2.5 text-xs ${on ? "border-accent bg-accent/10" : "border-hairline bg-surface-1"}`}>
                  <span aria-hidden>{r.emoji}</span>
                  <span aria-hidden className="tabular-nums">{n}</span>
                  <span className="sr-only">{SOCIAL.react.chip(n, r.label, on)}</span>
                </button>
              );
            })}
            <button type="button" aria-label={SOCIAL.react.add} title={SOCIAL.react.add} aria-expanded={picking} onClick={() => setPicking((v) => !v)} className="grid size-touch place-items-center rounded-full border border-hairline text-ink-secondary hover:text-ink">
              <SmilePlus aria-hidden className="size-4" />
            </button>
            {picking ? (
              <span className="flex gap-0.5 rounded-full border border-hairline bg-surface-1 p-1">
                {REACTIONS.map((r) => (
                  <button key={r.kind} type="button" aria-label={SOCIAL.react.with(r.label)} onClick={() => (setPicking(false), onReact(r.kind, !m.reactions.mine.includes(r.kind)))} className="grid size-touch place-items-center rounded-full text-base hover:bg-surface-2">
                    <span aria-hidden>{r.emoji}</span>
                  </button>
                ))}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** One room: the conversation, newest at the bottom, and the composer with the gate's state before anyone types. */
export function RoomPanel({ room, what }: { room: string; what: string }) {
  const r = useRoom(room);
  const social = useSocialSession();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [r.messages.length]);
  const submit = async () => {
    setBusy(true);
    const out = await r.post(draft);
    setBusy(false);
    // The draft stays until the message is saved: a failed post never loses what was typed.
    if (out.ok) setDraft("");
    else notify.item({ id: "room-post", type: "warning", title: out.message });
  };
  const block = async (author: string, who: string) => {
    const res = await fetch("/api/social/block", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: author }) }).catch(() => null);
    if (res?.ok) {
      r.hideAuthor(author);
      notify.item({ id: "room-block", title: SOCIAL.menu.blocked(who) });
    }
  };
  const gated = r.viewer?.canPost === false;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {r.state === "loading" && r.messages.length === 0 ? <p role="status" className="type-caption text-ink-secondary">{SOCIAL.room.loading}</p> : null}
      {r.state === "error" ? (
        <p role="alert" className="type-caption text-ink-secondary">{SOCIAL.room.error} <button type="button" className="min-h-11 underline" onClick={() => void r.reload()}>{SOCIAL.room.retryLoad}</button></p>
      ) : null}
      {r.state === "ready" && r.messages.length === 0 ? <p className="type-caption text-ink-secondary">{SOCIAL.room.empty}</p> : null}
      <ol ref={list} aria-label={SOCIAL.room.title} aria-live="polite" className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
        {r.messages.map((m) => (
          <Message key={m.id} m={m} me={r.signedIn} onReact={(k, on) => void r.react(m.id, k, on)} onRetry={() => r.retry(m.id)} onReport={() => setReporting(m.id)} onBlock={() => void block(m.author, m.name ?? short(m.author))} />
        ))}
      </ol>
      <SheetFooter>
        <form className="flex flex-col gap-1 border-t border-hairline pt-2 [.slide-over-foot>&]:border-0 [.slide-over-foot>&]:pt-0" onSubmit={(e) => (e.preventDefault(), void submit())}>
          {gated ? <p className="type-caption text-ink-secondary">{SOCIAL.room.gated(what)}</p> : null}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!busy && !gated && draft.trim()) void submit();
                }
              }}
              rows={2}
              disabled={gated}
              aria-label={SOCIAL.room.placeholder}
              placeholder={SOCIAL.room.placeholder}
              className="min-h-touch flex-1 resize-none rounded-md border border-hairline bg-surface-1 p-2 text-base text-ink disabled:opacity-60"
            />
            {r.signedIn ? (
              <button type="submit" disabled={busy || gated || !draft.trim()} className="min-h-touch rounded-full bg-accent-fill px-4 type-body-strong text-on-accent disabled:opacity-50">
                {SOCIAL.room.send}
              </button>
            ) : (
              // Signed out: the one sign-in (a passkey session counts; any other wallet signs once), then the draft posts.
              <button type="button" onClick={() => void (draft.trim() ? submit() : social.ensure())} className="min-h-touch rounded-full bg-accent-fill px-4 type-body-strong text-on-accent">
                {SOCIAL.room.signIn}
              </button>
            )}
          </div>
          <span className="self-end type-caption tabular-nums text-ink-secondary" aria-hidden>{SOCIAL.room.count(draft.length, MAX)}</span>
        </form>
      </SheetFooter>
      {reporting ? <ReportDialog open onOpenChange={(o) => !o && setReporting(null)} target={{ kind: "comment", id: reporting }} /> : null}
    </div>
  );
}
