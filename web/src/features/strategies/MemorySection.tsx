"use client";
// Ported in role from Agari 03b30ab:web/src/features/strategies/{MemoryMarket,useSealedMemory}.ts(x) — the Memory Market
// (L-56) as one section of a strategy's drawer and page: a reader signs a request and the route checks the chain (the
// creator, or a live subscription); the creator seals new notes with a signature over the exact text.
import { networkFrom, readMemoryMessage, SEALED_BODY_MAX, SEALED_TITLE_MAX, sealMemoryMessage } from "@cwf/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { webEnv } from "@/lib/env";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import type { StrategyWire } from "./protocol";
import { STRATEGIES_KEY } from "./useStrategies";

const M = {
  title: "Its sealed memory",
  none: "No sealed memory yet.",
  listed: (title: string, chars: number) => `“${title}” · ${chars.toLocaleString()} characters, readable by its copiers`,
  read: "Sign to read it",
  reading: "Checking the chain…",
  subscribe: "Copy it to read — copying is what pays its creator.",
  failed: "That didn't open. Try again in a moment.",
  seal: "Seal a memory",
  sealHelp: "Notes only your copiers can read: what it has learned, how to read its calls. Signed by you, stored off chain.",
  noteTitle: "Title",
  noteBody: "Notes",
  sealCta: "Sign and seal",
  sealed: "Sealed. Your copiers can read it now.",
  signIn: "Sign in to read it",
};

export function MemorySection({ card, wallet }: { card: StrategyWire; wallet: string | null }) {
  const shell = useWalletShell();
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState<{ title: string; body: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const network = networkFrom(webEnv.markets.network);
  const isCreator = wallet !== null && wallet.toLowerCase() === card.creator.toLowerCase();

  const read = async () => {
    if (!wallet) return;
    setBusy(true);
    setStatus(M.reading);
    try {
      const issuedAtMs = Date.now();
      const signature = await shell.signMessage(readMemoryMessage({ network, strategyId: card.strategyId, reader: wallet, issuedAtMs }));
      const res = await fetch("/api/strategies/memory/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ strategyId: card.strategyId, reader: wallet, issuedAtMs, signature }) });
      if (res.status === 402) setStatus(M.subscribe);
      else if (!res.ok) setStatus(M.failed);
      else {
        setOpened((await res.json()) as { title: string; body: string });
        setStatus(null);
      }
    } catch {
      setStatus(M.failed);
    } finally {
      setBusy(false);
    }
  };

  const seal = async () => {
    if (!wallet) return;
    setBusy(true);
    try {
      const issuedAtMs = Date.now();
      const t = title.trim();
      const signature = await shell.signMessage(sealMemoryMessage({ network, strategyId: card.strategyId, creator: wallet, issuedAtMs, title: t, body }));
      const res = await fetch("/api/strategies/memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ strategyId: card.strategyId, creator: wallet, issuedAtMs, title: t, body, signature }) });
      setStatus(res.ok ? M.sealed : M.failed);
      if (res.ok) await queryClient.invalidateQueries({ queryKey: STRATEGIES_KEY });
    } catch {
      setStatus(M.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2 border-t border-hairline pt-4">
      <h3 className="type-label-micro text-ink-secondary">{M.title}</h3>
      {card.memory ? <p className="type-body text-ink-secondary">{M.listed(card.memory.title, card.memory.chars)}</p> : !isCreator ? <p className="type-body text-ink-secondary">{M.none}</p> : null}
      {opened ? (
        <article className="flex flex-col gap-1 rounded-md bg-surface-2 px-3 py-2">
          <span className="type-body-strong text-ink">{opened.title}</span>
          <p className="whitespace-pre-wrap type-body text-ink-secondary">{opened.body}</p>
        </article>
      ) : card.memory ? (
        <button type="button" disabled={busy} onClick={() => (wallet ? void read() : shell.openPicker("tempo"))} className="min-h-touch self-start rounded-full border border-hairline px-4 type-body-strong text-ink hover:bg-surface-2 disabled:opacity-50">
          {wallet ? M.read : M.signIn}
        </button>
      ) : null}
      {isCreator && (
        <div className="flex flex-col gap-2 pt-2">
          <span className="type-body-strong text-ink">{M.seal}</span>
          <span className="type-caption text-ink-secondary">{M.sealHelp}</span>
          <label htmlFor={`memory-title-${card.strategyId}`} className="sr-only">{M.noteTitle}</label>
          <Input id={`memory-title-${card.strategyId}`} placeholder={M.noteTitle} value={title} maxLength={SEALED_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} className="min-h-touch" />
          <label htmlFor={`memory-body-${card.strategyId}`} className="sr-only">{M.noteBody}</label>
          <textarea id={`memory-body-${card.strategyId}`} placeholder={M.noteBody} value={body} maxLength={SEALED_BODY_MAX} rows={5} onChange={(e) => setBody(e.target.value)} className="rounded-md border border-input bg-ground px-3 py-2 type-body text-ink" />
          <button type="button" disabled={busy || title.trim() === "" || body.trim() === ""} onClick={() => void seal()} className="min-h-touch self-start rounded-full bg-accent-fill px-5 type-body-strong text-on-accent disabled:opacity-50">{M.sealCta}</button>
        </div>
      )}
      {status && <p role="status" className="type-caption text-ink-secondary">{status}</p>}
    </section>
  );
}
