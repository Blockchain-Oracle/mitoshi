"use client";
// Ported in role from Agari 03b30ab:web/src/features/strategies/{MemoryMarket,useSealedMemory}.ts(x) — the Memory Market
// (L-56) as one section of a strategy's drawer and page: a copier (or the creator) signs a request and the route checks
// the chain; anyone else may buy one read over MPP at the price the creator signed (S9.9b); the creator seals new notes
// with a signature over the exact text and price.
import { formatBaseUnits, MEMORY_READ_PRICE_MAX_BASE, networkFrom, parseDecimalToBaseUnits, readMemoryMessage, SEALED_BODY_MAX, SEALED_TITLE_MAX, sealMemoryMessage, USD_DECIMALS, type Address } from "@cwf/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { webEnv } from "@/lib/env";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import type { StrategyWire } from "./protocol";
import { STRATEGIES_KEY } from "./useStrategies";

const usd = (base: bigint) => `$${formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 6 })}`;

const M = {
  title: "Its sealed memory",
  none: "No sealed memory yet.",
  listed: (title: string, chars: number) => `“${title}” · ${chars.toLocaleString()} characters`,
  who: (price: bigint) => (price > 0n ? `Copiers read it free; anyone else can buy one read for ${usd(price)}, paid to its creator.` : "Only its copiers can read it."),
  read: "Sign to read it",
  reading: "Checking the chain…",
  buy: (price: bigint) => `Buy one read · ${usd(price)}`,
  paying: "Paying its creator…",
  copyToRead: "Copy it to read — copying is what pays its creator.",
  blocked: "Its creator's account isn't accepting payments from you right now, so nothing was sent.",
  notOffered: "Its creator has stopped selling single reads.",
  failed: "That didn't open. Try again in a moment.",
  seal: "Seal a memory",
  sealHelp: "Notes only your copiers can read: what it has learned, how to read its calls. Signed by you, stored off chain.",
  noteTitle: "Title",
  noteBody: "Notes",
  price: "One read for non-copiers ($)",
  priceHelp: `0 keeps it to your copiers. At most ${usd(MEMORY_READ_PRICE_MAX_BASE)}; paid to you over MPP.`,
  priceBad: `Enter 0 to ${usd(MEMORY_READ_PRICE_MAX_BASE)}.`,
  sealCta: "Sign and seal",
  sealed: "Sealed. Your copiers can read it now.",
  signIn: "Sign in to read it",
};

export function MemorySection({ card, wallet, copying }: { card: StrategyWire; wallet: string | null; copying: boolean }) {
  const shell = useWalletShell();
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState<{ title: string; body: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priceText, setPriceText] = useState("0.25");
  const network = networkFrom(webEnv.markets.network);
  const isCreator = wallet !== null && wallet.toLowerCase() === card.creator.toLowerCase();
  const price = card.memory ? BigInt(card.memory.readPriceBase) : 0n;
  const priceBase = parseDecimalToBaseUnits(priceText, USD_DECIMALS);
  const priceOk = priceBase !== null && priceBase <= MEMORY_READ_PRICE_MAX_BASE;

  const read = async () => {
    if (!wallet) return;
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
    if (!wallet) return;
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

  const seal = async () => {
    if (!wallet || priceBase === null || !priceOk) return;
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

  const action = (() => {
    if (opened || !card.memory) return null;
    const button = "min-h-touch self-start rounded-full border border-hairline px-4 type-body-strong text-ink hover:bg-surface-2 disabled:opacity-50";
    if (!wallet) return <button type="button" onClick={() => shell.openPicker("tempo")} className={button}>{M.signIn}</button>;
    if (isCreator || copying) return <button type="button" disabled={busy} onClick={() => void read()} className={button}>{M.read}</button>;
    if (price > 0n) return <button type="button" disabled={busy} onClick={() => void buy()} className={button}>{M.buy(price)}</button>;
    return <p className="type-caption text-ink-secondary">{M.copyToRead}</p>;
  })();

  return (
    <section className="flex flex-col gap-2 border-t border-hairline pt-4">
      <h3 className="type-label-micro text-ink-secondary">{M.title}</h3>
      {card.memory ? (
        <p className="flex flex-col gap-0.5">
          <span className="type-body text-ink">{M.listed(card.memory.title, card.memory.chars)}</span>
          <span className="type-caption text-ink-secondary">{M.who(price)}</span>
        </p>
      ) : !isCreator ? <p className="type-body text-ink-secondary">{M.none}</p> : null}
      {opened ? (
        <article className="flex flex-col gap-1 rounded-md bg-surface-2 px-3 py-2">
          <span className="type-body-strong text-ink">{opened.title}</span>
          <p className="whitespace-pre-wrap type-body text-ink-secondary">{opened.body}</p>
        </article>
      ) : action}
      {isCreator && (
        <div className="flex flex-col gap-2 pt-2">
          <span className="type-body-strong text-ink">{M.seal}</span>
          <span className="type-caption text-ink-secondary">{M.sealHelp}</span>
          <label htmlFor={`memory-title-${card.strategyId}`} className="sr-only">{M.noteTitle}</label>
          <Input id={`memory-title-${card.strategyId}`} placeholder={M.noteTitle} value={title} maxLength={SEALED_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} className="min-h-touch" />
          <label htmlFor={`memory-body-${card.strategyId}`} className="sr-only">{M.noteBody}</label>
          <textarea id={`memory-body-${card.strategyId}`} placeholder={M.noteBody} value={body} maxLength={SEALED_BODY_MAX} rows={5} onChange={(e) => setBody(e.target.value)} className="rounded-md border border-input bg-ground px-3 py-2 type-body text-ink" />
          <label htmlFor={`memory-price-${card.strategyId}`} className="flex flex-col gap-1">
            <span className="type-body-strong text-ink">{M.price}</span>
            <Input id={`memory-price-${card.strategyId}`} inputMode="decimal" autoComplete="off" value={priceText} onChange={(e) => setPriceText(e.target.value)} aria-invalid={priceOk ? undefined : true} aria-describedby={`memory-price-${card.strategyId}-help`} className="min-h-touch tabular-nums" />
            <span id={`memory-price-${card.strategyId}-help`} className={priceOk ? "type-caption text-ink-secondary" : "type-caption text-loss"}>{priceOk ? M.priceHelp : M.priceBad}</span>
          </label>
          <button type="button" disabled={busy || title.trim() === "" || body.trim() === "" || !priceOk} onClick={() => void seal()} className="min-h-touch self-start rounded-full bg-accent-fill px-5 type-body-strong text-on-accent disabled:opacity-50">{M.sealCta}</button>
        </div>
      )}
      {status && <p role="status" className="type-caption text-ink-secondary">{status}</p>}
    </section>
  );
}
