// Under the hero, rebuilt (round 7): the tape of every asset's last signed price, the features bento and How it works.
// The bento is From 21st.dev 18898 uilayout.contact/feature-bento — its auto-rows grid, the 2×2 lead tile beside
// smaller ones, a corner arrow per tile — with real fragments only: the crypto and stock tiles draw each asset's last
// half hour from ops (`/prices/recent`, server SVG, no JS) with its price and its move. The steps are From 21st.dev 26891
// ln-dev7/how-it-works-09 — three columns joined by a line, mono numbers — each over a crop of a real capture of the
// app. The tape is CSS alone (two copies sliding, paused under the pointer, still under reduced motion).
import { ArrowUpRight, Bot, Fingerprint, Gamepad2, Layers, ShieldCheck } from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { connection } from "next/server";
import type { CSSProperties, ReactNode } from "react";
import { formatCadence } from "@cwf/core/copy";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { webEnv } from "@/lib/env";
import { landingBoard } from "./board";
import { lineGeometry } from "./hero/sparkline";
import { printUsd } from "./print-usd";
import { WORDS } from "./words";

// ── The tape ──────────────────────────────────────────────────────────────────────────────────────────────────────

const signedAt = (sec: number) => new Date(sec * 1000).toISOString().slice(11, 16);

export async function LandingTape() {
  await connection();
  const board = await landingBoard();
  const rows = board?.assets ?? [];
  if (rows.length === 0) return <TapeWait />;
  const { tape } = WORDS;
  const items = (copy: boolean) =>
    rows.map((r) => (
      <Link key={r.symbol} href={`/trade/${r.symbol}`} className="lp-tape-item" tabIndex={copy ? -1 : undefined}>
        <AssetDisc asset={r.symbol} className="lp-tape-disc" />
        <span className="lp-tape-symbol">{r.symbol}</span>
        {r.print ? (
          <>
            <span className="lp-tape-print">{printUsd(r.print.priceE8)}</span>
            <span className="lp-tape-when">{tape.signed(signedAt(r.print.atSec))}</span>
          </>
        ) : null}
        <span className="lp-tape-chip">{formatCadence(r.cadenceSec)}</span>
      </Link>
    ));
  return (
    <section aria-label={tape.label} className="lp-tape">
      <div className="lp-tape-viewport">
        <div className="lp-tape-track" style={{ "--lp-tape-dur": `${Math.max(36, rows.length * 4)}s` } as CSSProperties}>
          <div className="lp-tape-copy">{items(false)}</div>
          <div className="lp-tape-copy" aria-hidden inert>{items(true)}</div>
        </div>
      </div>
    </section>
  );
}

export function TapeWait() {
  return <div className="lp-tape" aria-hidden><div className="lp-tape-viewport" /></div>;
}

// ── The bento ─────────────────────────────────────────────────────────────────────────────────────────────────────

interface Spark {
  symbol: string;
  d: string;
  priceE8: string;
  movePct: number;
}

const SPARK_W = 120;
const SPARK_H = 36;
const SPAN_MS = 30 * 60_000;

/** One asset's last half hour from ops, as a sparkline path, its last price and its move; null when ops has none. */
async function spark(symbol: string): Promise<Spark | null> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  const base = webEnv.markets.opsUrl?.replace(/\/+$/, "");
  if (!base) return null;
  const res = await fetch(`${base}/prices/recent?symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(2_000) }).catch(() => null);
  if (!res?.ok) return null;
  const points = (((await res.json()) as { points?: [number, string][] }).points ?? []).filter(([, p]) => /^\d+$/.test(p));
  if (points.length < 2) return null;
  const last = points.at(-1)!;
  const line = points.map(([t, p]) => ({ t, p: Number(BigInt(p)) / 1e8 }));
  const geo = lineGeometry(line, SPARK_W, SPARK_H, null, SPAN_MS, last[0]);
  const first = line[0]!.p;
  return { symbol, d: geo.d, priceE8: last[1], movePct: first > 0 ? ((line.at(-1)!.p - first) / first) * 100 : 0 };
}

function SparkRow({ s }: { s: Spark }) {
  const up = s.movePct >= 0;
  return (
    <li className="lp-spark-row">
      <AssetDisc asset={s.symbol} className="lp-spark-disc" />
      <span className="lp-spark-sym">{s.symbol}</span>
      <svg className="lp-spark" viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" aria-hidden data-up={up || undefined}>
        <path d={s.d} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="lp-spark-price">{printUsd(s.priceE8)}</span>
      <span className="lp-spark-move" data-up={up || undefined}>{`${up ? "+" : "−"}${Math.abs(s.movePct).toFixed(2)}%`}</span>
    </li>
  );
}

async function SparkList({ symbols }: { symbols: readonly string[] }) {
  await connection();
  const rows = (await Promise.all(symbols.map((s) => spark(s).catch(() => null)))).filter((s): s is Spark => s !== null);
  if (rows.length === 0) return null;
  return <ul className="lp-spark-list">{rows.map((s) => <SparkRow key={s.symbol} s={s} />)}</ul>;
}

function Tile({ href, className, eyebrow, title, line, icon, children }: { href: string; className: string; eyebrow?: string; title: string; line: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <Link href={href} className={`lp-tile ${className}`}>
      <span className="lp-tile-arrow" aria-hidden><ArrowUpRight /></span>
      {icon ? <span className="lp-tile-icon" aria-hidden>{icon}</span> : null}
      {eyebrow ? <span className="lp-eyebrow">{eyebrow}</span> : null}
      <span className="lp-tile-title">{title}</span>
      <span className="lp-tile-line">{line}</span>
      {children}
    </Link>
  );
}

export function LandingBento({ crypto, stocks }: { crypto: ReactNode; stocks: ReactNode }) {
  const b = WORDS.bento;
  return (
    <section className="lp-section" aria-labelledby="lp-bento-title">
      <div className="lp-wrap">
        <header className="lp-head">
          <span className="lp-eyebrow">{b.kicker}</span>
          <h2 id="lp-bento-title" className="lp-h2">{b.title}</h2>
        </header>
        <div className="lp-bento">
          <Tile href="/markets" className="lp-tile--crypto" eyebrow={b.crypto.eyebrow} title={b.crypto.title} line={b.crypto.line}>{crypto}</Tile>
          <Tile href="/markets" className="lp-tile--stocks" eyebrow={b.stocks.eyebrow} title={b.stocks.title} line={b.stocks.line}>{stocks}</Tile>
          <Tile href="/games" className="lp-tile--games" icon={<Gamepad2 />} title={b.games.title} line={b.games.line} />
          <Tile href="/parlay" className="lp-tile--parlay" icon={<Layers />} title={b.parlay.title} line={b.parlay.line} />
          <Tile href="/agents" className="lp-tile--agents" icon={<Bot />} title={b.agents.title} line={b.agents.line} />
          <Tile href="/trade/BTC" className="lp-tile--passkey" icon={<Fingerprint />} title={b.passkey.title} line={b.passkey.line} />
          <Tile href="/trade/BTC" className="lp-tile--private" icon={<ShieldCheck />} title={b.private.title} line={b.private.line} />
        </div>
      </div>
    </section>
  );
}

export const CRYPTO_SPARKS = ["BTC", "ETH", "SOL"] as const;
export const STOCK_SPARKS = ["TSLA", "NVDA", "AAPL"] as const;
export { SparkList };

// ── How it works ─────────────────────────────────────────────────────────────────────────────────────────────────

export function LandingHow() {
  const h = WORDS.how;
  return (
    <section id="how" className="lp-section lp-how" aria-labelledby="lp-how-title">
      <div className="lp-wrap">
        <header className="lp-head">
          <span className="lp-eyebrow">{h.kicker}</span>
          <h2 id="lp-how-title" className="lp-h2">{h.title}</h2>
        </header>
        <ol className="lp-steps">
          {h.steps.map((s) => (
            <li key={s.n} className="lp-step">
              <div className="lp-step-crop" data-crop={s.crop}>
                <picture>
                  <source srcSet={`/app/screens/${s.shot}.avif`} type="image/avif" />
                  <img src={`/app/screens/${s.shot}.webp`} alt={s.alt} loading="lazy" decoding="async" width={780} height={1696} />
                </picture>
              </div>
              <span className="lp-step-n">{s.n}</span>
              <h3 className="lp-step-title">{s.title}</h3>
              <p className="lp-step-line">{s.line}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
