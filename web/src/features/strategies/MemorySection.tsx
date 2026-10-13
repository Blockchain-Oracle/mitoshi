"use client";
// Ported in role from Agari 03b30ab:web/src/features/strategies/{MemoryMarket,useSealedMemory}.ts(x) — the Memory Market
// (L-56). R4-6 (D-227) splits it: the reader is the drawer's and the cockpit's Memory tab, as a locked card (From
// 21st.dev 29282 sean0205/pro-feature-alert, revamped: the lock, the title, one action, its price line — Mitoshi tokens,
// no gradient); the creator's seal form lives on its own desk (Yours). A copier (or the creator) signs a request and the
// route checks the chain; anyone else may buy one read over MPP at the price the creator signed (S9.9b).
import { formatBaseUnits, MEMORY_READ_PRICE_MAX_BASE, networkFrom, parseDecimalToBaseUnits, readMemoryMessage, SEALED_BODY_MAX, SEALED_TITLE_MAX, sealMemoryMessage, USD_DECIMALS, type Address } from "@cwf/core";
import { useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { useState } from "react";
import { webEnv } from "@/lib/env";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import type { StrategyWire } from "./protocol";
import { STRATEGIES_KEY } from "./useStrategies";
import "./copy-form.css";
import "./desk.css";

const usd = (base: bigint) => `$${formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 6 })}`;

const M = {
  none: "No sealed memory yet.",
  meta: (chars: number, price: bigint) => `${chars.toLocaleString()} chars · copiers free${price > 0n ? ` · ${usd(price)} a read` : ""}`,
  read: "Read",
  reading: "Checking the chain…",
  buy: (price: bigint) => `Buy one read · ${usd(price)}`,
  paying: "Paying its creator…",
  copyToRead: "Copy to read",
  blocked: "Creator not accepting payments. Nothing sent.",
  notOffered: "No longer sold per read.",
  failed: "That didn't open. Try again.",
  seal: "Seal a memory",
  noteTitle: "Title",
  noteBody: "Notes",
  price: "One read ($)",
  priceHelp: "0 = copiers only",
  priceBad: `0 to ${usd(MEMORY_READ_PRICE_MAX_BASE)}`,
  sealCta: "Sign and seal",
  sealed: "Sealed.",
};

/** The reader: a locked card with one action — Read (copier or creator), Buy one read, or Copy to read. */
export function MemoryReader({ card, wallet, copying, onCopy }: { card: StrategyWire; wallet: string | null; copying: boolean; onCopy?: () => void }) {
  const shell = useWalletShell();
  const [opened, setOpened] = useState<{ title: string; body: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const network = networkFrom(webEnv.markets.network);
  const isCreator = wallet !== null && wallet.toLowerCase() === card.creator.toLowerCase();
  const price = card.memory ? BigInt(card.memory.readPriceBase) : 0n;
  if (!card.memory) return <p className="desk-note text-ink-muted">{M.none}</p>;

  const read = async () => {
    if (!wallet) return shell.openPicker("tempo", `${M.read} ${card.name}`);
    setBusy(true);
    setStatus(M.reading);
    try {
      const issuedAtMs = Date.now();
      const signature = await shell.signMessage(readMemoryMessage({ network, strategyId: card.strategyId, reader: wallet, issuedAtMs }));
      const res = await fetch("/api/strategies/memory/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ strategyId: card.strategyId, reader: wallet, issuedAtMs, signature }) });
      if (res.status === 402) setStatus(M.copyToRead);
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

  const buy = async () => {
    if (!wallet) return shell.openPicker("tempo", `${M.buy(price)} · ${card.name}`);
    setBusy(true);
    setStatus(M.paying);
    try {
      // Loaded on the tap: mppx, wagmi's connector client and the chain config stay out of the desk's first load.
      const [{ buyMemoryRead }, { getConnectorClient }, { getWagmiConfig, TEMPO_CHAIN }] = await Promise.all([import("@cwf/markets/strategies"), import("wagmi/actions"), import("@/providers/wallet/wagmi-config")]);
      const outcome = await buyMemoryRead({
        url: `/api/strategies/${card.strategyId}/memory`,
        creator: card.creator as Address,
        payer: wallet as Address,
        chainId: TEMPO_CHAIN.id,
        getClient: () => getConnectorClient(getWagmiConfig(), { chainId: TEMPO_CHAIN.id }),
      });
      if (outcome.kind === "read") {
        setOpened({ title: outcome.title, body: outcome.body });
        setStatus(null);
      } else setStatus(outcome.why === "receiver-blocks" ? M.blocked : outcome.why === "not-offered" ? M.notOffered : M.failed);
    } catch {
      setStatus(M.failed);
    } finally {
      setBusy(false);
    }
  };

  const canRead = !wallet || isCreator || copying;
  const action = canRead ? (
    <button type="button" disabled={busy} onClick={() => void read()} className="strat-sensei self-start">{M.read}</button>
  ) : price > 0n ? (
    <button type="button" disabled={busy} onClick={() => void buy()} className="strat-sensei self-start">{M.buy(price)}</button>
  ) : (
    <button type="button" disabled={!onCopy} onClick={onCopy} className="strat-sensei self-start">{M.copyToRead}</button>
  );

  return (
    <article className="mem-card" aria-live="polite">
      <div className="mem-card-head">
        <span className="mem-card-lock" aria-hidden>{opened ? <LockKeyholeOpen /> : <LockKeyhole />}</span>
        <div className="min-w-0">
          <p className="mem-card-title">{opened?.title ?? card.memory.title}</p>
          <p className="mem-card-meta">{M.meta(card.memory.chars, price)}</p>
        </div>
      </div>
      {opened ? <p className="mem-card-body">{opened.body}</p> : <><span className="mem-card-veil" aria-hidden />{action}</>}
      {status && <p role="status" className="desk-note text-ink-secondary">{status}</p>}
    </article>
  );
}

/** The creator's seal form (its own desk only): title, notes, one read's price; signed over the exact text. */
export function SealMemory({ card, wallet }: { card: StrategyWire; wallet: string }) {
  const shell = useWalletShell();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priceText, setPriceText] = useState("0.25");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const network = networkFrom(webEnv.markets.network);
  const priceBase = parseDecimalToBaseUnits(priceText, USD_DECIMALS);
  const priceOk = priceBase !== null && priceBase <= MEMORY_READ_PRICE_MAX_BASE;
  const id = `memory-${card.strategyId}`;
  const seal = async () => {
    if (priceBase === null || !priceOk) return;
    setBusy(true);
    try {
      const issuedAtMs = Date.now();
      const t = title.trim();
      const signature = await shell.signMessage(sealMemoryMessage({ network, strategyId: card.strategyId, creator: wallet, issuedAtMs, title: t, readPriceBase: priceBase, body }));
      const res = await fetch("/api/strategies/memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ strategyId: card.strategyId, creator: wallet, issuedAtMs, title: t, readPriceBase: priceBase.toString(), body, signature }) });
      setStatus(res.ok ? M.sealed : M.failed);
      if (res.ok) await queryClient.invalidateQueries({ queryKey: STRATEGIES_KEY });
    } catch {
      setStatus(M.failed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="desk-eyebrow text-ink/40">{M.seal}</p>
      <label htmlFor={`${id}-title`} className="sr-only">{M.noteTitle}</label>
      <input id={`${id}-title`} className="strat-input text-ink" placeholder={M.noteTitle} value={title} maxLength={SEALED_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor={`${id}-body`} className="sr-only">{M.noteBody}</label>
      <textarea id={`${id}-body`} className="strat-input strat-textarea text-ink" placeholder={M.noteBody} value={body} maxLength={SEALED_BODY_MAX} rows={5} onChange={(e) => setBody(e.target.value)} />
      <label htmlFor={`${id}-price`} className="desk-field-label">
        {M.price}
        <input id={`${id}-price`} className="strat-input mt-2 text-ink" inputMode="decimal" autoComplete="off" value={priceText} onChange={(e) => setPriceText(e.target.value)} aria-invalid={priceOk ? undefined : true} />
        <span className={priceOk ? "desk-note mt-1 block normal-case tracking-normal text-ink-muted" : "copy-field-error"}>{priceOk ? M.priceHelp : M.priceBad}</span>
      </label>
      <button type="button" disabled={busy || title.trim() === "" || body.trim() === "" || !priceOk} onClick={() => void seal()} className="strat-sensei self-start">{M.sealCta}</button>
      {status && <p role="status" className="desk-note text-ink-secondary">{status}</p>}
    </div>
  );
}
