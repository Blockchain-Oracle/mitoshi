// `/proof/<market>` (S5, L-15) — Ported from Owarine 90a91d71:web/src/features/proof/ProofScreen.tsx's status frame on
// Agari 03b30ab's two checks (R4-10, D-227): 00 Print proof with the one Re-verify pill in its head; the prints as status
// rows beside the cream receipt; 01 the Window's timeline from its real transactions (opened, both record txs,
// settled); 02 the re-verify answers. Read per request from the indexer, on the configured network — never a pinned one.
import { TEMPO_RPC_HTTP, txUrl, type Network } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import Link from "next/link";
import { connection } from "next/server";
import { ExternalLink } from "@/components/shell/ExternalLink";
import { SectionHeader } from "@/components/shell/SectionHeader";
import { Receipt, ReceiptRow } from "@/components/receipt";
import { docsUrl } from "@/lib/docs-url";
import { webEnv } from "@/lib/env";
import { PROOF } from "./copy";
import { readProof, type ProofPrint, type ProofWindow } from "./data";
import { ProofVerify, ReverifyAll, ReverifyResults, type ProofCheck } from "./ProofVerify";
import "@/components/kit/kit.css";

const utc = (sec: number) => new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16);
const usd = (e8: string) => `$${(Number(e8) / 1e8).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
const lane = (cadenceSec: number, basis: number) => (basis === 1 ? "Gap" : `${basis === 2 ? "24/7 " : ""}${formatCadence(cadenceSec)}`);
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

type Outcome = keyof typeof PROOF.verdict.detail;
const outcomeOf = (w: ProofWindow): Outcome => (w.state === "voided" ? "void" : w.state === "resolved" ? (w.winner === 0 ? "up" : "down") : "open");
const TONE: Record<Outcome, string> = { up: "good", down: "bad", void: "off", open: "off" };

function checksOf(w: ProofWindow, network: Network): ProofCheck[] {
  if (!w.feed || !w.verifier) return [];
  const rpcUrl = TEMPO_RPC_HTTP[network];
  const out: ProofCheck[] = [];
  for (const [which, t] of [[0, w.tradingStartSec], [1, w.expirySec]] as const) {
    const name = PROOF.which[which]!;
    const p = w.prints.find((x) => x.which === which);
    if (p?.copied) out.push({ id: `r${which}`, label: PROOF.row.record(name), kind: "copied" });
    else if (p?.txHash) out.push({ id: `r${which}`, label: PROOF.row.record(name), kind: "record", expectedE8: p.priceE8, input: { rpcUrl, txHash: p.txHash, market: w.market, which, feed: w.feed, t: p.sourceTsSec, verifier: w.verifier } });
    if (p && !p.copied) out.push({ id: `a${which}`, label: PROOF.row.archive(name), kind: "archive", expectedE8: p.priceE8, input: { rpcUrl, market: w.market, which, feed: w.feed, t: p.sourceTsSec, verifier: w.verifier } });
    // A settled Window missing a print (a void): what the archive held at that instant, and the verifier's answer.
    if (!p && w.state !== "open") out.push({ id: `a${which}`, label: PROOF.row.archive(name), kind: "archive", expectedE8: null, input: { rpcUrl, market: w.market, which, feed: w.feed, t, verifier: w.verifier } });
  }
  return out;
}

function TxLink({ hash, network }: { hash: `0x${string}` | null; network: Network }) {
  if (!hash) return <>—</>;
  return <a href={txUrl(hash, network)} target="_blank" rel="noopener noreferrer">{short(hash)} ↗</a>;
}

function PrintRow({ name, p, network }: { name: string; p: ProofPrint | undefined; network: Network }) {
  return (
    <div className="status-row">
      <span className="status-dot" data-tone={p ? "good" : "off"} aria-hidden />
      <span className="status-row-label">{`${name} · ${PROOF.source}`}</span>
      <span className="status-row-lag">{p ? usd(p.priceE8) : "—"}</span>
      <span className="status-row-detail">{p ? (p.copied ? PROOF.copied : <>{PROOF.signerCount(p.signers)} · <TxLink hash={p.txHash} network={network} /></>) : PROOF.none}</span>
    </div>
  );
}

function Timeline({ w, network }: { w: ProofWindow; network: Network }) {
  const T = PROOF.timeline;
  const open = w.prints.find((p) => p.which === 0);
  const close = w.prints.find((p) => p.which === 1);
  const steps: { label: string; at: string | null; hash: `0x${string}` | null }[] = [
    { label: T.opened, at: utc(w.tradingStartSec), hash: w.openedTx },
    { label: T.open, at: open ? utc(open.recordedTsSec) : null, hash: open?.txHash ?? null },
    { label: T.close, at: close ? utc(close.recordedTsSec) : null, hash: close?.txHash ?? null },
    { label: T.settled, at: w.resolvedTsSec === null ? null : utc(w.resolvedTsSec), hash: w.resolvedTx },
  ];
  return (
    <ol className="proof-timeline">
      {steps.map((s) => (
        <li key={s.label} className="proof-step" data-done={s.hash !== null || s.at !== null}>
          <span className="proof-step-dot" aria-hidden />
          <span className="type-body-strong text-ink">{s.label}</span>
          <span className="type-caption text-ink-secondary tabular-nums">{s.at ? `${s.at} UTC` : T.pending}</span>
          <span className="status-row-lag"><TxLink hash={s.hash} network={network} /></span>
        </li>
      ))}
    </ol>
  );
}

export async function ProofScreen({ market }: { market: `0x${string}` }) {
  await connection();
  const w = await readProof(market);
  if (w === null) return <p className="type-body text-ink-secondary">{PROOF.unreachable}</p>;
  if (w === "unknown") return <p className="type-body text-ink-secondary">{PROOF.unknown}</p>;
  const network: Network = webEnv.markets.network;
  const outcome = outcomeOf(w);
  const open = w.prints.find((p) => p.which === 0);
  const close = w.prints.find((p) => p.which === 1);
  return (
    <ProofVerify checks={checksOf(w, network)}>
      <SectionHeader index="00" title={PROOF.title} desc={PROOF.window(w.symbol, lane(w.cadenceSec, w.basis), utc(w.expirySec))} aside={<ReverifyAll />} />
      <div className="proof-cx-grid">
        <div className="status-table">
          <div className="status-table-head"><span className="status-table-title">{PROOF.table}</span></div>
          <div className="status-table-body">
            <PrintRow name={PROOF.which[0]!} p={open} network={network} />
            <PrintRow name={PROOF.which[1]!} p={close} network={network} />
            <div className="status-row">
              <span className="status-dot" data-tone={TONE[outcome]} aria-hidden />
              <span className="status-row-label">{PROOF.result}</span>
              <span className="status-row-lag">{PROOF.verdict[outcome]}</span>
              <span className="status-row-detail">{PROOF.verdict.detail[outcome]}</span>
            </div>
          </div>
        </div>
        <Receipt title={PROOF.receipt.title} figure={close ? usd(close.priceE8) : "—"} figureLabel={PROOF.receipt.figure} settledAtMs={(w.resolvedTsSec ?? w.expirySec) * 1000} className="proof-receipt">
          <ReceiptRow label={PROOF.receipt.open}>{open ? usd(open.priceE8) : "—"}</ReceiptRow>
          <ReceiptRow label={PROOF.receipt.close}>{close ? usd(close.priceE8) : "—"}</ReceiptRow>
          <ReceiptRow label={PROOF.receipt.signers}>{close ? String(close.signers) : open ? String(open.signers) : "—"}</ReceiptRow>
          <ReceiptRow label={PROOF.receipt.outcome}>{PROOF.verdict[outcome]}</ReceiptRow>
          <ReceiptRow label={PROOF.receipt.settle} href={w.resolvedTx ? txUrl(w.resolvedTx, network) : null}>{w.resolvedTx ? short(w.resolvedTx) : PROOF.timeline.pending}</ReceiptRow>
        </Receipt>
      </div>
      <section className="flex flex-col gap-4" aria-label={PROOF.timeline.title}>
        <SectionHeader index={PROOF.timeline.index} title={PROOF.timeline.title} />
        <Timeline w={w} network={network} />
      </section>
      <section className="flex flex-col gap-4" aria-label={PROOF.check.title}>
        <SectionHeader index={PROOF.check.index} title={PROOF.check.title} aside={<ExternalLink href={docsUrl("trading/proof")} className="type-caption text-accent">{PROOF.check.how}</ExternalLink>} />
        <ReverifyResults />
      </section>
    </ProofVerify>
  );
}
