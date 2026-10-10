"use client";
// Takes on the terminal (S13 step 4; Agari 03b30ab `TakeReelCard` + `TakeComposer`, the reel card's grammar in a list):
// the ticker's takes, newest first — who, which side on which Window, the caption with its cashtags as links, "Backed"
// when the author has a call there, reactions, and Tail / Fade (the terminal on that Window with the same side, or the
// other one, picked; nothing trades from the feed). The composer is bound to the Window on screen (UX fix 10).
import Link from "next/link";
import { useState } from "react";
import { captionParts } from "@cwf/core/social";
import { formatCadence } from "@cwf/core/copy";
import { notify } from "@/lib/toast";
import { SOCIAL } from "./copy";
import { REACTIONS } from "./reactions";
import { ReportDialog } from "./report-dialog-lazy";
import { useTakes, type Take } from "./useTakes";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const lineText = (raw: string | null) => (raw === null ? null : `$${(Number(raw) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
const CAPTION_MAX = 240;

export function TakeCard({ t, me, onReact, onDismiss, onReport, onBlock }: { t: Take; me: string | null; onReact: (k: (typeof REACTIONS)[number]["kind"], on: boolean) => void; onDismiss: () => void; onReport: () => void; onBlock: () => void }) {
  const who = t.name ?? short(t.author);
  const live = t.expirySec * 1000 > Date.now();
  const words = SOCIAL.takes;
  return (
    <li className="flex flex-col gap-1.5 py-3" aria-busy={t.local?.state === "sending" || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/u/${t.author}`} className="type-body-strong text-ink underline-offset-2 hover:underline">{me === t.author ? `${who} (${SOCIAL.room.you})` : who}</Link>
        <span className={`rounded-full px-2 type-caption font-bold ${t.side === "up" ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"}`}>{t.side === "up" ? words.up : words.down}</span>
        <span className="type-caption text-ink-secondary">{words.window(t.asset, formatCadence(t.intervalSec), lineText(t.lineRaw))}</span>
        {t.backed ? <span className="rounded-full border border-hairline px-2 type-caption text-ink-secondary" title={words.backedWhy}>{words.backed}</span> : null}
      </div>
      {t.caption ? (
        <p className="whitespace-pre-wrap break-words type-body text-ink">
          {captionParts(t.caption).map((p, i) => ("symbol" in p ? <Link key={i} href={`/trade/${p.symbol}`} className="text-accent underline-offset-2 hover:underline">{p.text}</Link> : <span key={i}>{p.text}</span>))}
        </p>
      ) : null}
      {t.local?.state === "failed" ? (
        <p role="alert" className="flex items-center gap-2 type-caption text-warning">{t.local.error}<button type="button" className="min-h-11 underline" onClick={onDismiss}>{words.dismiss}</button></p>
      ) : t.local?.state === "sending" ? (
        <p role="status" className="type-caption text-ink-secondary">{SOCIAL.room.sending}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {REACTIONS.map((r) => {
            const n = t.reactions.counts[r.kind] ?? 0;
            const on = t.reactions.mine.includes(r.kind);
            return (
              <button key={r.kind} type="button" aria-pressed={on} onClick={() => onReact(r.kind, !on)} className={`inline-flex min-h-touch items-center gap-1 rounded-full border px-2.5 text-xs ${on ? "border-accent bg-accent/10" : "border-hairline bg-surface-1"}`}>
                <span aria-hidden>{r.emoji}</span>
                {n ? <span aria-hidden className="tabular-nums">{n}</span> : null}
                <span className="sr-only">{SOCIAL.react.chip(n, r.label, on)}</span>
              </button>
            );
          })}
          {live ? (
            <>
              <Link href={`/trade/${t.asset}?w=${t.marketId}&pick=${t.side}`} className="ml-auto inline-flex min-h-touch items-center rounded-full border border-hairline px-3 type-caption font-bold">{words.tail}</Link>
              <Link href={`/trade/${t.asset}?w=${t.marketId}&pick=${t.side === "up" ? "down" : "up"}`} className="inline-flex min-h-touch items-center rounded-full border border-hairline px-3 type-caption font-bold">{words.fade}</Link>
            </>
          ) : <span className="ml-auto type-caption text-ink-secondary">{words.ended}</span>}
          {me !== t.author ? (
            <>
              <button type="button" className="min-h-touch px-2 type-caption text-ink-secondary underline" onClick={onReport}>{SOCIAL.menu.report}</button>
              <button type="button" className="min-h-touch px-2 type-caption text-ink-secondary underline" onClick={onBlock}>{SOCIAL.menu.block(who)}</button>
            </>
          ) : null}
        </div>
      )}
    </li>
  );
}

export interface TakeWindow {
  marketId: string;
  asset: string;
  intervalSec: number;
  expirySec: number;
}

/** The composer bound to one Window (UX fix 10): a side, a caption, one post; the caption survives a failed post. */
export function TakeComposer({ window, post, signedIn, onPosted }: { window: TakeWindow; post: ReturnType<typeof useTakes>["post"]; signedIn: string | null; onPosted?: () => void }) {
  const [side, setSide] = useState<"up" | "down" | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const words = SOCIAL.takes;
  const submit = async () => {
    if (!side) return;
    setBusy(true);
    const out = await post({ marketId: window.marketId, side, caption, window });
    setBusy(false);
    // The caption stays until the take is saved: a failed post never loses what was written.
    if (out.ok) (setCaption(""), setSide(null), onPosted?.());
    else notify.item({ id: "take-post", type: "warning", title: out.message });
  };
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => (e.preventDefault(), void submit())} aria-label={words.compose}>
      <p className="type-caption text-ink-secondary">{words.on(window.asset, formatCadence(window.intervalSec))}</p>
      <div role="radiogroup" aria-label={words.side} className="flex gap-2">
        {(["up", "down"] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => setSide(s)} className={`min-h-touch flex-1 rounded-full border type-body-strong ${side === s ? (s === "up" ? "border-profit bg-profit/15 text-profit" : "border-loss bg-loss/15 text-loss") : "border-hairline"}`}>
            {s === "up" ? words.up : words.down}
          </button>
        ))}
      </div>
      <textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))} rows={2} aria-label={words.caption} placeholder={words.caption} className="resize-none rounded-md border border-hairline bg-surface-1 p-2 text-base text-ink" />
      <button type="submit" disabled={!side || busy} className="min-h-touch rounded-full bg-accent-fill px-4 type-body-strong text-on-accent disabled:opacity-50">{signedIn ? words.post : SOCIAL.room.signIn}</button>
    </form>
  );
}

export function TakesPanel({ symbol, window }: { symbol: string; window: TakeWindow | null }) {
  const t = useTakes({ symbol });
  const [reporting, setReporting] = useState<string | null>(null);
  const words = SOCIAL.takes;
  const block = async (author: string, who: string) => {
    const res = await fetch("/api/social/block", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: author }) }).catch(() => null);
    if (res?.ok) (t.hideAuthor(author), notify.item({ id: "take-block", title: SOCIAL.menu.blocked(who) }));
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {window ? (
        <div className="border-b border-hairline pb-3"><TakeComposer window={window} post={t.post} signedIn={t.signedIn} /></div>
      ) : <p className="type-caption text-ink-secondary">{words.noWindow}</p>}
      {t.state === "loading" && t.takes.length === 0 ? <p role="status" className="type-caption text-ink-secondary">{words.loading}</p> : null}
      {t.state === "error" ? <p role="alert" className="type-caption text-ink-secondary">{words.error} <button type="button" className="min-h-11 underline" onClick={() => void t.reload()}>{SOCIAL.room.retryLoad}</button></p> : null}
      {t.state === "ready" && t.takes.length === 0 ? <p className="type-caption text-ink-secondary">{words.empty(symbol)}</p> : null}
      <ol aria-label={words.title(symbol)} className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
        {t.takes.map((x) => (
          <TakeCard key={x.id} t={x} me={t.signedIn} onReact={(k, on) => void t.react(x.id, k, on)} onDismiss={() => t.dismiss(x.id)} onReport={() => setReporting(x.id)} onBlock={() => void block(x.author, x.name ?? short(x.author))} />
        ))}
      </ol>
      {reporting ? <ReportDialog open onOpenChange={(o) => !o && setReporting(null)} target={{ kind: "take", id: reporting }} /> : null}
    </div>
  );
}
